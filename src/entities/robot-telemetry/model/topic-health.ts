import { RingBuffer } from '@/shared/lib/ring-buffer';

import type {
  RobotTelemetryEvent,
  TelemetryChannel,
} from './robot-telemetry';

interface RateSample {
  readonly receivedTimestampMs: number;
  readonly sequence: number;
}

export type TopicHealthState = 'waiting' | 'healthy' | 'stale' | 'unknown';

export interface TopicHealthSnapshot {
  readonly channel: TelemetryChannel;
  readonly state: TopicHealthState;
  readonly expectedHz: number | null;
  readonly observedHz: number;
  readonly sourceTimestampMs: number | null;
  readonly lastReceivedTimestampMs: number | null;
  readonly latencyMs: number | null;
  readonly messageCount: number;
  readonly outOfOrderCount: number;
}

/** 늦게 도착한 원본이 UI의 최신 채널 값을 과거로 되돌리지 않게 한다. */
export function isNewerTelemetryEvent(
  current: RobotTelemetryEvent | null,
  candidate: RobotTelemetryEvent,
): boolean {
  return current === null
    || (
      current.channel === candidate.channel
      && candidate.sequence > current.sequence
      && candidate.sourceTimestampMs >= current.sourceTimestampMs
    );
}

interface TopicHealthTrackerOptions {
  readonly channel: TelemetryChannel;
  readonly expectedHz: number | null;
  readonly staleAfterMs: number | null;
  readonly rateSampleCapacity?: number;
}

/** channel별 expected rate와 stale 기준을 독립적으로 계산한다. */
export class TopicHealthTracker {
  readonly #channel: TelemetryChannel;
  readonly #expectedHz: number | null;
  readonly #staleAfterMs: number | null;
  readonly #samples: RingBuffer<RateSample>;
  #sourceTimestampMs: number | null = null;
  #lastReceivedTimestampMs: number | null = null;
  #lastSequence: number | null = null;
  #latencyMs: number | null = null;
  #messageCount = 0;
  #outOfOrderCount = 0;

  constructor({
    channel,
    expectedHz,
    staleAfterMs,
    rateSampleCapacity = 40,
  }: TopicHealthTrackerOptions) {
    this.#channel = channel;
    this.#expectedHz = expectedHz;
    this.#staleAfterMs = staleAfterMs;
    this.#samples = new RingBuffer(rateSampleCapacity);
  }

  /** raw 수신 수는 집계하되 최신 health 기준으로 채택했는지를 반환한다. */
  record(event: RobotTelemetryEvent): boolean {
    if (event.channel !== this.#channel) {
      return false;
    }

    this.#messageCount += 1;
    const isOutOfOrder = (
      (this.#sourceTimestampMs !== null &&
        event.sourceTimestampMs < this.#sourceTimestampMs) ||
      (this.#lastSequence !== null && event.sequence <= this.#lastSequence)
    );
    if (isOutOfOrder) {
      this.#outOfOrderCount += 1;
      return false;
    }

    this.#sourceTimestampMs = event.sourceTimestampMs;
    const acceptedReceivedTimestampMs = Math.max(
      this.#lastReceivedTimestampMs ?? event.receivedTimestampMs,
      event.receivedTimestampMs,
    );
    this.#lastReceivedTimestampMs = acceptedReceivedTimestampMs;
    this.#lastSequence = event.sequence;
    this.#latencyMs = Math.max(
      0,
      acceptedReceivedTimestampMs - event.sourceTimestampMs,
    );
    this.#samples.push({
      receivedTimestampMs: acceptedReceivedTimestampMs,
      sequence: event.sequence,
    });
    return true;
  }

  snapshot(nowMs: number): TopicHealthSnapshot {
    const samples = this.#samples.toArray();
    const firstSample = samples[0];
    const lastSample = samples.at(-1);
    let observedHz = 0;

    if (
      firstSample !== undefined &&
      lastSample !== undefined &&
      lastSample.receivedTimestampMs > firstSample.receivedTimestampMs
    ) {
      observedHz =
        ((lastSample.sequence - firstSample.sequence) * 1000) /
        (lastSample.receivedTimestampMs - firstSample.receivedTimestampMs);
    }

    const isStale =
      this.#staleAfterMs !== null &&
      this.#lastReceivedTimestampMs !== null &&
      (nowMs - this.#lastReceivedTimestampMs > this.#staleAfterMs ||
        (this.#latencyMs ?? 0) > this.#staleAfterMs);

    return {
      channel: this.#channel,
      state:
        this.#lastReceivedTimestampMs === null
          ? 'waiting'
          : this.#staleAfterMs === null
            ? 'unknown'
            : isStale
            ? 'stale'
            : 'healthy',
      expectedHz: this.#expectedHz,
      observedHz,
      sourceTimestampMs: this.#sourceTimestampMs,
      lastReceivedTimestampMs: this.#lastReceivedTimestampMs,
      latencyMs: this.#latencyMs,
      messageCount: this.#messageCount,
      outOfOrderCount: this.#outOfOrderCount,
    };
  }
}
