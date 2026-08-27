import { describe, expect, it } from 'vitest';

import type { RobotPoseTelemetryEvent } from './robot-telemetry';
import { TopicHealthTracker } from './topic-health';

function createPoseEvent(
  sequence: number,
  receivedTimestampMs: number,
  sourceTimestampMs = receivedTimestampMs,
): RobotPoseTelemetryEvent {
  return {
    schemaVersion: 1,
    eventId: `event-${String(sequence)}`,
    robotId: 'robot-1',
    sourceDeviceId: 'source-1',
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

describe('TopicHealthTracker', () => {
  it('sequence와 수신 간격으로 약 20Hz를 계산한다', () => {
    const tracker = new TopicHealthTracker({
      channel: 'pose',
      expectedHz: 20,
      staleAfterMs: 300,
    });

    for (let sequence = 1; sequence <= 20; sequence += 1) {
      tracker.record(createPoseEvent(sequence, sequence * 50));
    }

    expect(tracker.snapshot(1000).observedHz).toBeCloseTo(20, 3);
  });

  it('source timestamp 지연과 수신 중단을 stale로 판정한다', () => {
    const tracker = new TopicHealthTracker({
      channel: 'pose',
      expectedHz: 20,
      staleAfterMs: 300,
    });

    tracker.record(createPoseEvent(1, 1000, 500));
    expect(tracker.snapshot(1000).state).toBe('stale');

    tracker.record(createPoseEvent(2, 1100));
    expect(tracker.snapshot(1450).state).toBe('stale');
  });

  it('source timestamp 역행을 out-of-order로 집계한다', () => {
    const tracker = new TopicHealthTracker({
      channel: 'pose',
      expectedHz: 20,
      staleAfterMs: 300,
    });

    expect(tracker.record(createPoseEvent(1, 1000, 1000))).toBe(true);
    expect(tracker.record(createPoseEvent(2, 1050, 900))).toBe(false);

    expect(tracker.snapshot(1050)).toMatchObject({
      lastReceivedTimestampMs: 1000,
      messageCount: 2,
      outOfOrderCount: 1,
      sourceTimestampMs: 1000,
    });
  });

  it('중복 sequence를 raw 수신으로 세되 최신 health 기준은 되돌리지 않는다', () => {
    const tracker = new TopicHealthTracker({
      channel: 'pose',
      expectedHz: 20,
      staleAfterMs: 300,
    });

    tracker.record(createPoseEvent(2, 1000, 1000));
    expect(tracker.record(createPoseEvent(2, 1100, 1100))).toBe(false);

    expect(tracker.snapshot(1100)).toMatchObject({
      lastReceivedTimestampMs: 1000,
      messageCount: 2,
      outOfOrderCount: 1,
      sourceTimestampMs: 1000,
    });
  });

  it('stale 임계값이 없으면 수신 후 상태를 unknown으로 표시한다', () => {
    const tracker = new TopicHealthTracker({
      channel: 'pose',
      expectedHz: null,
      staleAfterMs: null,
    });
    tracker.record(createPoseEvent(1, 1000));
    expect(tracker.snapshot(5000)).toMatchObject({
      state: 'unknown',
      expectedHz: null,
    });
  });

  it('rate 계산은 전체 이력이 아니라 고정 길이의 최근 표본만 사용한다', () => {
    const tracker = new TopicHealthTracker({
      channel: 'pose',
      expectedHz: 20,
      staleAfterMs: 300,
      rateSampleCapacity: 4,
    });

    tracker.record(createPoseEvent(1, 0));
    tracker.record(createPoseEvent(2, 50));
    tracker.record(createPoseEvent(3, 100));
    tracker.record(createPoseEvent(4, 150));
    tracker.record(createPoseEvent(5, 250));
    tracker.record(createPoseEvent(6, 350));
    tracker.record(createPoseEvent(7, 450));

    expect(tracker.snapshot(450).observedHz).toBeCloseTo(10, 3);
  });
});
