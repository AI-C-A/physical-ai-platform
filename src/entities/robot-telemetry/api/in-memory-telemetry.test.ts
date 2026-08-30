import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  RobotTelemetryEvent,
  TelemetryConnectionState,
} from '../model/robot-telemetry';
import { InMemoryTelemetryAdapter } from './in-memory-telemetry';

const quietScenario = {
  poseGapStartMs: 100_000,
  connectionLossStartMs: 200_000,
  stalePoseSequence: 10_000,
  outOfOrderPoseSequence: 10_001,
} as const;

describe('InMemoryTelemetryAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('하나의 연결에서 여러 Robot과 서로 다른 channel 주기를 전달한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1', 'robot-2'], {
      scenario: quietScenario,
    });
    const events: RobotTelemetryEvent[] = [];
    adapter.subscribe(
      {
        robotIds: ['robot-1', 'robot-2'],
        channels: ['pose', 'battery'],
      },
      (event) => events.push(event),
    );

    await adapter.connect();
    await vi.advanceTimersByTimeAsync(1100);
    adapter.disconnect();

    const poseEvents = events.filter((event) => event.channel === 'pose');
    const batteryEvents = events.filter(
      (event) => event.channel === 'battery',
    );
    expect(new Set(poseEvents.map((event) => event.robotId))).toEqual(
      new Set(['robot-1', 'robot-2']),
    );
    expect(poseEvents.length).toBeGreaterThanOrEqual(40);
    expect(batteryEvents).toHaveLength(2);
    expect(poseEvents[0]?.payload).toEqual({
      latitude: null,
      longitude: null,
    });
    expect(batteryEvents.find((event) => event.robotId === 'robot-1')?.payload)
      .toEqual({
        battery: 92,
        isConnecting: true,
        isCharging: false,
      });
  });

  it('내부 channel 이름을 유지하고 알 수 없는 주기를 null로 표현한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1']);

    await expect(adapter.getChannelDescriptors()).resolves.toEqual([
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
    adapter.dispose();
  });

  it('subscription별 maxDeliveryHz를 적용한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1'], {
      scenario: quietScenario,
    });
    const events: RobotTelemetryEvent[] = [];
    adapter.subscribe(
      {
        robotIds: ['robot-1'],
        channels: ['pose'],
        maxDeliveryHz: 5,
      },
      (event) => events.push(event),
    );

    await adapter.connect();
    await vi.advanceTimersByTimeAsync(1100);
    adapter.disconnect();

    expect(events.length).toBeGreaterThanOrEqual(5);
    expect(events.length).toBeLessThanOrEqual(6);
  });

  it('channel 중단·재연결·stale·out-of-order 시나리오를 재현한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1'], {
      scenario: {
        poseGapStartMs: 500,
        poseGapDurationMs: 250,
        connectionLossStartMs: 900,
        connectionLossDurationMs: 250,
        stalePoseSequence: 3,
        outOfOrderPoseSequence: 4,
      },
    });
    const events: RobotTelemetryEvent[] = [];
    const states: TelemetryConnectionState[] = [];
    adapter.subscribe(
      { robotIds: ['robot-1'], channels: ['pose', 'battery'] },
      (event) => events.push(event),
    );
    adapter.subscribeConnection((state) => states.push(state));

    await adapter.connect();
    await vi.advanceTimersByTimeAsync(1200);
    adapter.disconnect();

    expect(states).toEqual(
      expect.arrayContaining([
        'connecting',
        'connected',
        'degraded',
        'reconnecting',
      ]),
    );
    const poseEvents = events.filter((event) => event.channel === 'pose');
    const staleEvent = poseEvents.find((event) => event.sequence === 3);
    const outOfOrderEvent = poseEvents.find((event) => event.sequence === 4);
    expect(staleEvent).toBeDefined();
    expect(
      (staleEvent?.receivedTimestampMs ?? 0) -
        (staleEvent?.sourceTimestampMs ?? 0),
    ).toBe(3000);
    expect(outOfOrderEvent?.sourceTimestampMs).toBeLessThan(
      staleEvent?.sourceTimestampMs ?? Number.NEGATIVE_INFINITY,
    );
    expect(
      poseEvents.some(
        (event) =>
          event.receivedTimestampMs >= 500 &&
          event.receivedTimestampMs < 750,
      ),
    ).toBe(false);
  });

  it('dispose에서 연결 timer와 listener를 정리하고 재사용을 막는다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1'], {
      scenario: quietScenario,
    });
    const events: RobotTelemetryEvent[] = [];
    adapter.subscribe(
      { robotIds: ['robot-1'], channels: ['pose', 'battery'] },
      (event) => events.push(event),
    );
    await adapter.connect();
    await vi.advanceTimersByTimeAsync(200);
    const eventCountAtDispose = events.length;

    adapter.dispose();
    adapter.dispose();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(events).toHaveLength(eventCountAtDispose);
    await expect(adapter.connect()).rejects.toThrow('종료된 Telemetry Adapter');
    expect(() => adapter.subscribe(
      { robotIds: ['robot-1'], channels: ['pose'] },
      vi.fn(),
    )).toThrow('종료된 Telemetry Adapter');
  });

  it('dispose 중 disconnected listener의 재진입 connect가 timer를 되살리지 않는다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1'], {
      scenario: quietScenario,
    });
    let reconnect: Promise<void> | null = null;
    adapter.subscribeConnection((state) => {
      if (state === 'disconnected') reconnect = adapter.connect();
    });
    await adapter.connect();

    adapter.dispose();

    await expect(reconnect).rejects.toThrow('종료된 Telemetry Adapter');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('초기 connection listener가 실패하면 부분 구독을 남기지 않는다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1'], {
      scenario: quietScenario,
    });
    const listener = vi.fn(() => {
      throw new Error('초기 connection listener 실패');
    });

    expect(() => adapter.subscribeConnection(listener)).toThrow(
      '초기 connection listener 실패',
    );
    await adapter.connect();

    expect(listener).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('connection listener 하나가 실패해도 dispose와 나머지 알림을 완료한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1'], {
      scenario: quietScenario,
    });
    let failOnDisconnect = false;
    adapter.subscribeConnection((state) => {
      if (failOnDisconnect && state === 'disconnected') {
        throw new Error('disconnected listener 실패');
      }
    });
    const healthyListener = vi.fn();
    adapter.subscribeConnection(healthyListener);
    await adapter.connect();
    failOnDisconnect = true;

    expect(() => adapter.dispose()).not.toThrow();

    expect(healthyListener).toHaveBeenLastCalledWith('disconnected');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('data listener 하나가 실패해도 제거하고 나머지 고주기 구독을 계속 전달한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1'], {
      scenario: quietScenario,
    });
    const failingListener = vi.fn(() => {
      throw new Error('Telemetry listener 실패');
    });
    const healthyListener = vi.fn();
    const subscription = {
      channels: ['pose'] as const,
      robotIds: ['robot-1'],
    };
    adapter.subscribe(subscription, failingListener);
    adapter.subscribe(subscription, healthyListener);

    await adapter.connect();
    await vi.advanceTimersByTimeAsync(250);

    expect(failingListener).toHaveBeenCalledOnce();
    expect(healthyListener.mock.calls.length).toBeGreaterThan(1);
    adapter.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
