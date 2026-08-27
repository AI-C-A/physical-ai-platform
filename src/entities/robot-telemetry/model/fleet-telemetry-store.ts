import { systemScheduler, type Scheduler, type SchedulerTimer } from '@/shared/lib/scheduler';

import type {
  RobotBatteryTelemetryEvent,
  RobotPoseTelemetryEvent,
  RobotTelemetryEvent,
  TelemetryConnectionState,
} from './robot-telemetry';
import type { RobotTelemetryPort } from './robot-telemetry-port';
import { isNewerTelemetryEvent } from './topic-health';
import {
  acquireTelemetryConnection,
  type TelemetryConnectionLease,
} from './telemetry-lifecycle';

export interface FleetRobotTelemetry {
  readonly battery: RobotBatteryTelemetryEvent | null;
  readonly pose: RobotPoseTelemetryEvent | null;
}

export interface FleetTelemetrySnapshot {
  readonly connectionState: TelemetryConnectionState;
  readonly robots: Readonly<Record<string, FleetRobotTelemetry>>;
}

const deliveryIntervalMs = 200;

/** 여러 Robot 원시 이벤트를 하나의 최대 5Hz React snapshot으로 배치한다. */
export class FleetTelemetryStore {
  readonly #port: RobotTelemetryPort;
  #robotIds: readonly string[];
  readonly #scheduler: Scheduler;
  readonly #listeners = new Set<() => void>();
  readonly #latest = new Map<string, FleetRobotTelemetry>();
  #connectionState: TelemetryConnectionState = 'disconnected';
  #snapshot: FleetTelemetrySnapshot = { connectionState: 'disconnected', robots: {} };
  #timer: SchedulerTimer | null = null;
  #unsubscribeTelemetry: (() => void) | null = null;
  #unsubscribeConnection: (() => void) | null = null;
  #desiredRunning = false;
  #running = false;
  #connectionLease: TelemetryConnectionLease | null = null;
  #generation = 0;
  #lifecycle: Promise<void> = Promise.resolve();
  #activeStart: Promise<void> | null = null;

  constructor(port: RobotTelemetryPort, robotIds: readonly string[], scheduler: Scheduler = systemScheduler) {
    this.#port = port;
    this.#robotIds = robotIds;
    this.#scheduler = scheduler;
    robotIds.forEach((robotId) =>
      this.#latest.set(robotId, {
        battery: null,
        pose: null,
      }),
    );
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): FleetTelemetrySnapshot => this.#snapshot;

  /** Strict Mode 재마운트에서도 현재 세대의 Fleet 구독과 timer만 유지한다. */
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

  setRobotIds(robotIds: readonly string[]): void {
    if (this.#desiredRunning || this.#running) {
      throw new Error('실행 중인 Fleet 텔레메트리 대상은 변경할 수 없습니다.');
    }
    if (
      this.#robotIds.length === robotIds.length
      && this.#robotIds.every((robotId, index) => robotId === robotIds[index])
    ) {
      return;
    }
    const hadRobotIds = this.#robotIds.length > 0;
    this.#robotIds = [...robotIds];
    this.#latest.clear();
    robotIds.forEach((robotId) =>
      this.#latest.set(robotId, {
        battery: null,
        pose: null,
      }),
    );
    this.#connectionState = 'disconnected';
    if (hadRobotIds) {
      this.#snapshot = { connectionState: 'disconnected', robots: {} };
      this.#listeners.forEach((listener) => listener());
    }
  }

  async #startGeneration(generation: number): Promise<void> {
    if (!this.#isCurrent(generation)) return;
    try {
      this.#unsubscribeConnection = this.#port.subscribeConnection((state) => {
        if (!this.#isCurrent(generation)) return;
        this.#connectionState = state;
      });
      this.#unsubscribeTelemetry = this.#port.subscribe(
        {
          robotIds: this.#robotIds,
          channels: ['pose', 'battery'],
          maxDeliveryHz: 20,
        },
        (event) => {
          if (!this.#isCurrent(generation)) return;
          this.#record(event);
        },
      );
      this.#timer = this.#scheduler.setInterval(() => this.#flush(), deliveryIntervalMs);

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
    const timer = this.#timer;
    this.#unsubscribeTelemetry = null;
    this.#unsubscribeConnection = null;
    this.#timer = null;

    [
      unsubscribeTelemetry,
      unsubscribeConnection,
      timer === null ? null : () => this.#scheduler.clearInterval(timer),
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
    const current = this.#latest.get(event.robotId);
    if (current === undefined) return;
    if (event.channel === 'pose' && isNewerTelemetryEvent(current.pose, event)) {
      this.#latest.set(event.robotId, { ...current, pose: event });
    } else if (
      event.channel === 'battery'
      && isNewerTelemetryEvent(current.battery, event)
    ) {
      this.#latest.set(event.robotId, { ...current, battery: event });
    }
  }

  #flush(): void {
    this.#snapshot = {
      connectionState: this.#connectionState,
      robots: Object.fromEntries(this.#latest),
    };
    this.#listeners.forEach((listener) => listener());
  }
}

export const fleetTelemetryDeliveryHz = 1000 / deliveryIntervalMs;
