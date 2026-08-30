import {
  systemScheduler,
  type Scheduler,
  type SchedulerTimer,
} from '@/shared/lib/scheduler';
import type { ExecutionSource } from '@/shared/domain';

import type {
  RobotBatteryTelemetryEvent,
  RobotPoseTelemetryEvent,
  RobotTelemetryEvent,
  TelemetryChannel,
  TelemetryConnectionState,
} from '../model/robot-telemetry';
import type {
  RobotTelemetryPort,
  TelemetryChannelDescriptor,
  TelemetrySubscription,
} from '../model/robot-telemetry-port';

export interface InMemoryTelemetryScenario {
  readonly connectionDelayMs: number;
  readonly poseGapStartMs: number;
  readonly poseGapDurationMs: number;
  readonly connectionLossStartMs: number;
  readonly connectionLossDurationMs: number;
  readonly stalePoseSequence: number;
  readonly staleSourceOffsetMs: number;
  readonly outOfOrderPoseSequence: number;
}

interface SubscriptionRecord {
  readonly robotIds: ReadonlySet<string>;
  readonly channels: ReadonlySet<TelemetryChannel>;
  readonly maxDeliveryHz: number | null;
  readonly listener: (event: RobotTelemetryEvent) => void;
  readonly lastDeliveryByStream: Map<string, number>;
}

const defaultScenario: InMemoryTelemetryScenario = {
  connectionDelayMs: 100,
  poseGapStartMs: Number.POSITIVE_INFINITY,
  poseGapDurationMs: 1500,
  connectionLossStartMs: Number.POSITIVE_INFINITY,
  connectionLossDurationMs: 1500,
  stalePoseSequence: Number.POSITIVE_INFINITY,
  staleSourceOffsetMs: 3000,
  outOfOrderPoseSequence: Number.POSITIVE_INFINITY,
};

const poseIntervalMs = 50;
const batteryIntervalMs = 1000;

export class InMemoryTelemetryAdapter implements RobotTelemetryPort {
  readonly #robotIds: readonly string[];
  readonly #scheduler: Scheduler;
  readonly #scenario: InMemoryTelemetryScenario;
  readonly #subscriptions = new Set<SubscriptionRecord>();
  readonly #connectionListeners = new Set<
    (state: TelemetryConnectionState) => void
  >();
  readonly #sequenceByStream = new Map<string, number>();
  readonly #lastSourceByStream = new Map<string, number>();
  #state: TelemetryConnectionState = 'disconnected';
  #connectedAtMs: number | null = null;
  #poseTimer: SchedulerTimer | null = null;
  #batteryTimer: SchedulerTimer | null = null;
  #disposed = false;

  constructor(
    robotIds: readonly string[],
    options: {
      readonly scheduler?: Scheduler;
      readonly scenario?: Partial<InMemoryTelemetryScenario>;
    } = {},
  ) {
    this.#robotIds = robotIds;
    this.#scheduler = options.scheduler ?? systemScheduler;
    this.#scenario = { ...defaultScenario, ...options.scenario };
  }

  getChannelDescriptors(): Promise<readonly TelemetryChannelDescriptor[]> {
    return Promise.resolve([
      {
        channel: 'pose',
        displayName: '위치 (latitude/longitude)',
        expectedRateHz: null,
        staleAfterMs: null,
      },
      {
        channel: 'battery',
        displayName: '운영 상태 (battery/flags)',
        expectedRateHz: null,
        staleAfterMs: null,
      },
    ]);
  }

  getExecutionSource(): Promise<ExecutionSource> {
    return Promise.resolve({ environment: 'physical', deliveryMode: 'live' });
  }

  connect(): Promise<void> {
    if (this.#disposed) {
      return Promise.reject(
        new Error('종료된 Telemetry Adapter는 다시 연결할 수 없습니다.'),
      );
    }
    if (this.#poseTimer !== null) {
      return Promise.resolve();
    }

    this.#connectedAtMs = this.#scheduler.now();
    this.#setState('connecting');
    this.#poseTimer = this.#scheduler.setInterval(
      () => this.#onPoseTick(),
      poseIntervalMs,
    );
    this.#batteryTimer = this.#scheduler.setInterval(
      () => this.#onBatteryTick(),
      batteryIntervalMs,
    );
    return Promise.resolve();
  }

  subscribe(
    subscription: TelemetrySubscription,
    listener: (event: RobotTelemetryEvent) => void,
  ): () => void {
    this.#assertActive();
    if (
      subscription.maxDeliveryHz !== undefined &&
      subscription.maxDeliveryHz <= 0
    ) {
      throw new Error('maxDeliveryHz는 0보다 커야 합니다.');
    }

    const record: SubscriptionRecord = {
      robotIds: new Set(subscription.robotIds),
      channels: new Set(subscription.channels),
      maxDeliveryHz: subscription.maxDeliveryHz ?? null,
      listener,
      lastDeliveryByStream: new Map(),
    };
    this.#subscriptions.add(record);
    return () => this.#subscriptions.delete(record);
  }

  subscribeConnection(
    listener: (state: TelemetryConnectionState) => void,
  ): () => void {
    this.#assertActive();
    this.#connectionListeners.add(listener);
    try {
      listener(this.#state);
    } catch (error: unknown) {
      this.#connectionListeners.delete(listener);
      throw error;
    }
    return () => this.#connectionListeners.delete(listener);
  }

  disconnect(): void {
    if (this.#poseTimer !== null) {
      this.#scheduler.clearInterval(this.#poseTimer);
      this.#poseTimer = null;
    }

    if (this.#batteryTimer !== null) {
      this.#scheduler.clearInterval(this.#batteryTimer);
      this.#batteryTimer = null;
    }

    this.#connectedAtMs = null;
    this.#setState('disconnected');
  }

  /** Composition Root가 소유한 timer와 listener를 애플리케이션 종료 시 함께 정리한다. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.disconnect();
    this.#subscriptions.clear();
    this.#connectionListeners.clear();
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('종료된 Telemetry Adapter는 사용할 수 없습니다.');
    }
  }

  #onPoseTick(): void {
    const nowMs = this.#scheduler.now();
    const elapsedMs = this.#getElapsedMs(nowMs);
    const state = this.#updateConnectionState(elapsedMs);

    if (
      state === 'connecting' ||
      state === 'reconnecting' ||
      this.#isWithin(
        elapsedMs,
        this.#scenario.poseGapStartMs,
        this.#scenario.poseGapDurationMs,
      )
    ) {
      return;
    }

    this.#robotIds.forEach((robotId) => {
      this.#deliver(this.#createPoseEvent(robotId, nowMs));
    });
  }

  #onBatteryTick(): void {
    const nowMs = this.#scheduler.now();
    const elapsedMs = this.#getElapsedMs(nowMs);
    const state = this.#updateConnectionState(elapsedMs);

    if (state === 'connecting' || state === 'reconnecting') {
      return;
    }

    this.#robotIds.forEach((robotId) => {
      this.#deliver(this.#createBatteryEvent(robotId, nowMs));
    });
  }

  #createPoseEvent(
    robotId: string,
    receivedTimestampMs: number,
  ): RobotPoseTelemetryEvent {
    const streamKey = `${robotId}:pose`;
    const sequence = this.#nextSequence(streamKey);
    const previousSourceTimestampMs =
      this.#lastSourceByStream.get(streamKey) ??
      receivedTimestampMs - poseIntervalMs;
    let sourceTimestampMs = receivedTimestampMs;

    if (sequence === this.#scenario.stalePoseSequence) {
      sourceTimestampMs =
        receivedTimestampMs - this.#scenario.staleSourceOffsetMs;
    } else if (sequence === this.#scenario.outOfOrderPoseSequence) {
      sourceTimestampMs = previousSourceTimestampMs - poseIntervalMs;
    }

    this.#lastSourceByStream.set(streamKey, sourceTimestampMs);
    return {
      schemaVersion: 1,
      eventId: `telemetry-${robotId}-pose-${String(sequence)}`,
      robotId,
      sourceDeviceId: 'bridge-primary',
      channel: 'pose',
      sourceTimestampMs,
      receivedTimestampMs,
      sequence,
      frameId: null,
      payload: {
        latitude: null,
        longitude: null,
      },
    };
  }

  #createBatteryEvent(
    robotId: string,
    receivedTimestampMs: number,
  ): RobotBatteryTelemetryEvent {
    const streamKey = `${robotId}:battery`;
    const sequence = this.#nextSequence(streamKey);
    this.#lastSourceByStream.set(streamKey, receivedTimestampMs);

    const numericId = Number(robotId.replace(/\D/gu, '')) || 1;
    return {
      schemaVersion: 1,
      eventId: `telemetry-${robotId}-battery-${String(sequence)}`,
      robotId,
      sourceDeviceId: 'bridge-primary',
      channel: 'battery',
      sourceTimestampMs: receivedTimestampMs,
      receivedTimestampMs,
      sequence,
      frameId: null,
      payload: {
        battery: Math.max(0, 96 - numericId * 4),
        isConnecting: true,
        isCharging: numericId % 4 === 0,
      },
    };
  }

  #deliver(event: RobotTelemetryEvent): void {
    const streamKey = `${event.robotId}:${event.channel}`;

    this.#subscriptions.forEach((subscription) => {
      if (
        !subscription.robotIds.has(event.robotId) ||
        !subscription.channels.has(event.channel)
      ) {
        return;
      }

      if (subscription.maxDeliveryHz !== null) {
        const minimumIntervalMs = 1000 / subscription.maxDeliveryHz;
        const lastDeliveryMs =
          subscription.lastDeliveryByStream.get(streamKey) ??
          Number.NEGATIVE_INFINITY;

        if (event.receivedTimestampMs - lastDeliveryMs < minimumIntervalMs) {
          return;
        }
      }

      subscription.lastDeliveryByStream.set(
        streamKey,
        event.receivedTimestampMs,
      );
      try {
        subscription.listener(event);
      } catch {
        // 실패한 구독은 제거해 다른 소비자와 이후 고주기 tick을 보호한다.
        this.#subscriptions.delete(subscription);
      }
    });
  }

  #nextSequence(streamKey: string): number {
    const sequence = (this.#sequenceByStream.get(streamKey) ?? 0) + 1;
    this.#sequenceByStream.set(streamKey, sequence);
    return sequence;
  }

  #getElapsedMs(nowMs: number): number {
    return this.#connectedAtMs === null ? 0 : nowMs - this.#connectedAtMs;
  }

  #updateConnectionState(elapsedMs: number): TelemetryConnectionState {
    let nextState: TelemetryConnectionState = 'connected';

    if (elapsedMs < this.#scenario.connectionDelayMs) {
      nextState = 'connecting';
    } else if (
      this.#isWithin(
        elapsedMs,
        this.#scenario.connectionLossStartMs,
        this.#scenario.connectionLossDurationMs,
      )
    ) {
      nextState = 'reconnecting';
    } else if (
      this.#isWithin(
        elapsedMs,
        this.#scenario.poseGapStartMs,
        this.#scenario.poseGapDurationMs,
      )
    ) {
      nextState = 'degraded';
    }

    this.#setState(nextState);
    return nextState;
  }

  #isWithin(elapsedMs: number, startMs: number, durationMs: number): boolean {
    return elapsedMs >= startMs && elapsedMs < startMs + durationMs;
  }

  #setState(state: TelemetryConnectionState): void {
    if (state === this.#state) {
      return;
    }

    this.#state = state;
    this.#connectionListeners.forEach((listener) => {
      try {
        listener(state);
      } catch {
        // 한 listener의 오류가 다른 연결 관찰자와 app scope 정리를 막지 않는다.
      }
    });
  }
}
