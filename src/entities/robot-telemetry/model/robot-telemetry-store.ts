import { systemScheduler, type Scheduler, type SchedulerTimer } from '@/shared/lib/scheduler';
import { RingBuffer } from '@/shared/lib/ring-buffer';
import type { ExecutionSource } from '@/shared/domain';

import type {
  RobotBatteryTelemetryEvent,
  RobotPoseTelemetryEvent,
  RobotTelemetryEvent,
  TelemetryConnectionState,
} from './robot-telemetry';
import type { RobotTelemetryPort } from './robot-telemetry-port';
import {
  acquireTelemetryConnection,
  type TelemetryConnectionLease,
} from './telemetry-lifecycle';
import {
  isNewerTelemetryEvent,
  TopicHealthTracker,
  type TopicHealthSnapshot,
} from './topic-health';

export interface RobotTelemetrySnapshot {
  readonly connectionState: TelemetryConnectionState;
  readonly executionSource: ExecutionSource | null;
  readonly pose: RobotPoseTelemetryEvent | null;
  readonly battery: RobotBatteryTelemetryEvent | null;
  readonly topicHealth: readonly TopicHealthSnapshot[];
  readonly recentEvents: readonly RobotTelemetryEvent[];
}

const uiDeliveryIntervalMs = 200;

function createInitialSnapshot(): RobotTelemetrySnapshot {
  return {
    connectionState: 'disconnected',
    executionSource: null,
    pose: null,
    battery: null,
    topicHealth: [],
    recentEvents: [],
  };
}

/** 원시 수신과 React 알림 주기를 분리해 UI 갱신을 최대 5Hz로 제한한다. */
export class RobotTelemetryStore {
  readonly #port: RobotTelemetryPort;
  #robotId: string | null;
  readonly #scheduler: Scheduler;
  readonly #listeners = new Set<() => void>();
  readonly #healthByChannel = new Map<RobotTelemetryEvent['channel'], TopicHealthTracker>();
  readonly #recentEvents = new RingBuffer<RobotTelemetryEvent>(40);
  #connectionState: TelemetryConnectionState = 'disconnected';
  #executionSource: ExecutionSource | null = null;
  #pose: RobotPoseTelemetryEvent | null = null;
  #battery: RobotBatteryTelemetryEvent | null = null;
  #snapshot: RobotTelemetrySnapshot = createInitialSnapshot();
  #flushTimer: SchedulerTimer | null = null;
  #unsubscribeTelemetry: (() => void) | null = null;
  #unsubscribeConnection: (() => void) | null = null;
  #desiredRunning = false;
  #running = false;
  #connectionLease: TelemetryConnectionLease | null = null;
  #generation = 0;
  #lifecycle: Promise<void> = Promise.resolve();
  #activeStart: Promise<void> | null = null;

  constructor(
    port: RobotTelemetryPort,
    robotId: string | null,
    scheduler: Scheduler = systemScheduler,
  ) {
    this.#port = port;
    this.#robotId = robotId;
    this.#scheduler = scheduler;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): RobotTelemetrySnapshot => this.#snapshot;

  /** stop 이후 늦게 끝난 초기화가 구독과 timer를 되살리지 않도록 시작 순서를 직렬화한다. */
  start(): Promise<void> {
    if (this.#desiredRunning && this.#activeStart !== null) return this.#activeStart;
    if (this.#desiredRunning) return Promise.resolve();

    this.#desiredRunning = true;
    const generation = ++this.#generation;
    const operation = this.#lifecycle.then(() => this.#startGeneration(generation));
    this.#lifecycle = operation.catch(() => undefined);
    this.#activeStart = operation;
    void operation.then(
      () => {
        if (this.#activeStart === operation) this.#activeStart = null;
      },
      () => {
        if (this.#activeStart === operation) this.#activeStart = null;
      },
    );
    return operation;
  }

  setRobotId(robotId: string): void {
    if (this.#desiredRunning || this.#running) {
      throw new Error('실행 중인 텔레메트리 대상은 변경할 수 없습니다.');
    }
    if (this.#robotId === robotId) return;
    const hadRobotId = this.#robotId !== null;
    this.#robotId = robotId;
    this.#executionSource = null;
    this.#pose = null;
    this.#battery = null;
    this.#connectionState = 'disconnected';
    this.#healthByChannel.clear();
    this.#recentEvents.clear();
    if (hadRobotId) {
      this.#snapshot = createInitialSnapshot();
      this.#listeners.forEach((listener) => listener());
    }
  }

  async #startGeneration(generation: number): Promise<void> {
    if (!this.#isCurrent(generation)) return;
    try {
      const robotId = this.#robotId;
      if (robotId === null) {
        throw new Error('텔레메트리 대상을 먼저 선택해야 합니다.');
      }
      const [descriptors, executionSource] = await Promise.all([
        this.#port.getChannelDescriptors(robotId),
        this.#port.getExecutionSource(),
      ]);

      if (!this.#isCurrent(generation)) return;

      this.#executionSource = executionSource;
      this.#healthByChannel.clear();
      descriptors.forEach((descriptor) => {
        this.#healthByChannel.set(
          descriptor.channel,
          new TopicHealthTracker({
            channel: descriptor.channel,
            expectedHz: descriptor.expectedRateHz,
            staleAfterMs: descriptor.staleAfterMs,
          }),
        );
      });
      this.#unsubscribeConnection = this.#port.subscribeConnection((state) => {
        if (!this.#isCurrent(generation)) return;
        this.#connectionState = state;
      });
      this.#unsubscribeTelemetry = this.#port.subscribe(
        {
          robotIds: [robotId],
          channels: ['pose', 'battery'],
          maxDeliveryHz: 20,
        },
        (event) => {
          if (!this.#isCurrent(generation)) return;
          this.#record(event);
        },
      );
      this.#flushTimer = this.#scheduler.setInterval(
        () => this.#flush(),
        uiDeliveryIntervalMs,
      );

      const connectionLease = acquireTelemetryConnection(this.#port);
      this.#connectionLease = connectionLease;
      await connectionLease.connected;

      if (!this.#isCurrent(generation)) {
        this.#cleanupResources();
        this.#releaseConnectionLease(connectionLease);
        return;
      }

      this.#running = true;
    } catch (error: unknown) {
      const isCurrent = this.#isCurrent(generation);
      this.#cleanupResources();
      this.#releaseConnectionLease();
      if (isCurrent) {
        this.#desiredRunning = false;
        this.#connectionState = 'error';
        this.#flush();
      }
      throw error;
    }
  }

  stop(): void {
    if (!this.#desiredRunning && !this.#running) return;

    this.#desiredRunning = false;
    this.#running = false;
    this.#generation += 1;
    this.#cleanupResources();
    this.#releaseConnectionLease();
  }

  #isCurrent(generation: number): boolean {
    return this.#desiredRunning && generation === this.#generation;
  }

  #cleanupResources(): void {
    const unsubscribeTelemetry = this.#unsubscribeTelemetry;
    const unsubscribeConnection = this.#unsubscribeConnection;
    const flushTimer = this.#flushTimer;
    this.#unsubscribeTelemetry = null;
    this.#unsubscribeConnection = null;
    this.#flushTimer = null;

    [
      unsubscribeTelemetry,
      unsubscribeConnection,
      flushTimer === null
        ? null
        : () => this.#scheduler.clearInterval(flushTimer),
    ].forEach((cleanup) => {
      try {
        cleanup?.();
      } catch {
        // 한 Port의 잘못된 해제가 나머지 listener와 timer 정리를 막지 않는다.
      }
    });
  }

  #releaseConnectionLease(expected?: TelemetryConnectionLease): void {
    const lease = this.#connectionLease;
    if (lease === null || (expected !== undefined && lease !== expected)) return;
    this.#connectionLease = null;
    try {
      lease.release();
    } catch {
      // Port disconnect 오류가 Store stop과 이후 세대 초기화를 깨뜨리지 않게 한다.
    }
  }

  #record(event: RobotTelemetryEvent): void {
    if (this.#robotId === null || event.robotId !== this.#robotId) {
      return;
    }

    const tracker = this.#healthByChannel.get(event.channel);
    const acceptedByHealth = tracker?.record(event);
    const isLatest =
      acceptedByHealth ??
      (event.channel === 'pose'
        ? isNewerTelemetryEvent(this.#pose, event)
        : isNewerTelemetryEvent(this.#battery, event));
    if (isLatest) {
      if (event.channel === 'pose') {
        this.#pose = event;
      } else {
        this.#battery = event;
      }
    }
    this.#recentEvents.push(event);
  }

  #flush(): void {
    const nowMs = this.#scheduler.now();
    this.#snapshot = {
      connectionState: this.#connectionState,
      executionSource: this.#executionSource,
      pose: this.#pose,
      battery: this.#battery,
      topicHealth: [...this.#healthByChannel.values()].map((tracker) => tracker.snapshot(nowMs)),
      recentEvents: this.#recentEvents.toArray(),
    };
    this.#listeners.forEach((listener) => listener());
  }
}

export const robotTelemetryUiDeliveryHz = 1000 / uiDeliveryIntervalMs;
