import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryTelemetryAdapter } from '../api/in-memory-telemetry';
import type {
  RobotPoseTelemetryEvent,
  RobotTelemetryEvent,
  TelemetryConnectionState,
} from './robot-telemetry';
import type {
  RobotTelemetryPort,
  TelemetryChannelDescriptor,
} from './robot-telemetry-port';
import { RobotTelemetryStore } from './robot-telemetry-store';

function createDeferred<TValue>() {
  let resolvePromise: (value: TValue) => void = () => undefined;
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function createPoseEvent(sequence: number): RobotPoseTelemetryEvent {
  const timestampMs = sequence * 50;
  return {
    schemaVersion: 1,
    eventId: `telemetry-robot-1-pose-${String(sequence)}`,
    robotId: 'robot-1',
    sourceDeviceId: 'test-source',
    channel: 'pose',
    sourceTimestampMs: timestampMs,
    receivedTimestampMs: timestampMs,
    sequence,
    frameId: null,
    payload: {
      latitude: 37 + sequence / 10_000,
      longitude: 127,
    },
  };
}

describe('RobotTelemetryStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('20Hz 원시 수신을 유지하면서 React 알림은 약 5Hz로 제한한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1'], {
      scenario: {
        poseGapStartMs: 100_000,
        connectionLossStartMs: 200_000,
        stalePoseSequence: 10_000,
        outOfOrderPoseSequence: 10_001,
      },
    });
    const store = new RobotTelemetryStore(adapter, 'robot-1');
    const listener = vi.fn();
    store.subscribe(listener);

    await store.start();
    await vi.advanceTimersByTimeAsync(1200);
    const snapshot = store.getSnapshot();
    store.stop();

    expect(listener).toHaveBeenCalledTimes(6);
    expect(snapshot.pose).not.toBeNull();
    expect(snapshot.battery).not.toBeNull();
    expect(snapshot.topicHealth[0]?.observedHz).toBeCloseTo(20, 1);
  });

  it('raw Telemetry 표본은 항상 최근 40개로 제한한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1']);
    const store = new RobotTelemetryStore(adapter, 'robot-1');

    await store.start();
    await vi.advanceTimersByTimeAsync(3000);
    const snapshot = store.getSnapshot();
    store.stop();

    expect(snapshot.recentEvents).toHaveLength(40);
    expect(snapshot.recentEvents.at(-1)?.sequence).toBeGreaterThan(
      snapshot.recentEvents[0]?.sequence ?? 0,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('out-of-order raw 이벤트를 진단 이력에 남기되 최신 Pose와 rate는 되돌리지 않는다', async () => {
    let emitTelemetry: (event: RobotTelemetryEvent) => void = () => undefined;
    const port: RobotTelemetryPort = {
      connect: () => Promise.resolve(),
      disconnect: vi.fn(),
      getChannelDescriptors: () => Promise.resolve([{
        channel: 'pose',
        displayName: 'Pose',
        expectedRateHz: 20,
        staleAfterMs: 300,
      }]),
      getExecutionSource: () => Promise.resolve({
        environment: 'physical',
        deliveryMode: 'live',
      }),
      subscribe: (_subscription, listener) => {
        emitTelemetry = listener;
        return () => undefined;
      },
      subscribeConnection: () => () => undefined,
    };
    const store = new RobotTelemetryStore(port, 'robot-1');
    await store.start();

    emitTelemetry(createPoseEvent(2));
    emitTelemetry({
      ...createPoseEvent(1),
      receivedTimestampMs: 150,
    });
    await vi.advanceTimersByTimeAsync(200);

    const snapshot = store.getSnapshot();
    expect(snapshot.pose?.sequence).toBe(2);
    expect(snapshot.recentEvents.map((event) => event.sequence)).toEqual([2, 1]);
    expect(snapshot.topicHealth[0]).toMatchObject({
      observedHz: 0,
      outOfOrderCount: 1,
      sourceTimestampMs: 100,
    });
    store.stop();
  });

  it('비동기 초기화 중 stop과 restart가 이어져도 현재 세대의 구독만 유지한다', async () => {
    const descriptors = createDeferred<readonly TelemetryChannelDescriptor[]>();
    const unsubscribeTelemetry = vi.fn();
    const unsubscribeConnection = vi.fn();
    const connect = vi.fn(() => Promise.resolve());
    const disconnect = vi.fn();
    const getChannelDescriptors = vi.fn(() => descriptors.promise);
    const subscribe = vi.fn(() => unsubscribeTelemetry);
    const subscribeConnection = vi.fn(() => unsubscribeConnection);
    const port: RobotTelemetryPort = {
      connect,
      disconnect,
      getChannelDescriptors,
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe,
      subscribeConnection,
    };
    const store = new RobotTelemetryStore(port, 'robot-1');

    const firstStart = store.start();
    await vi.waitFor(() => {
      expect(getChannelDescriptors).toHaveBeenCalledOnce();
    });
    store.stop();
    const restarted = store.start();
    descriptors.resolve([
      {
        channel: 'pose',
        displayName: 'Pose',
        expectedRateHz: 20,
        staleAfterMs: 300,
      },
    ]);
    await Promise.all([firstStart, restarted]);

    expect(getChannelDescriptors).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribeConnection).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    store.stop();
    expect(unsubscribeTelemetry).toHaveBeenCalledOnce();
    expect(unsubscribeConnection).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('같은 tick의 start 후 stop은 취소된 세대의 metadata 조회도 시작하지 않는다', async () => {
    const getChannelDescriptors = vi.fn(() => Promise.resolve([]));
    const getExecutionSource = vi.fn(() =>
      Promise.resolve({ environment: 'physical' as const, deliveryMode: 'live' as const }));
    const port: RobotTelemetryPort = {
      connect: vi.fn(() => Promise.resolve()),
      disconnect: vi.fn(),
      getChannelDescriptors,
      getExecutionSource,
      subscribe: vi.fn(() => () => undefined),
      subscribeConnection: vi.fn(() => () => undefined),
    };
    const store = new RobotTelemetryStore(port, 'robot-1');

    const start = store.start();
    store.stop();
    await start;

    expect(getChannelDescriptors).not.toHaveBeenCalled();
    expect(getExecutionSource).not.toHaveBeenCalled();
  });

  it('재시작 뒤 이전 세대의 늦은 callback이 현재 snapshot을 덮어쓰지 않는다', async () => {
    const telemetryListeners: Array<(event: RobotTelemetryEvent) => void> = [];
    const connectionListeners: Array<
      (state: TelemetryConnectionState) => void
    > = [];
    const unsubscribeTelemetry = vi.fn();
    const unsubscribeConnection = vi.fn();
    const port: RobotTelemetryPort = {
      connect: () => Promise.resolve(),
      disconnect: vi.fn(),
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: (_subscription, listener) => {
        telemetryListeners.push(listener);
        return unsubscribeTelemetry;
      },
      subscribeConnection: (listener) => {
        connectionListeners.push(listener);
        return unsubscribeConnection;
      },
    };
    const store = new RobotTelemetryStore(port, 'robot-1');

    await store.start();
    store.stop();
    await store.start();

    connectionListeners[1]?.('connected');
    telemetryListeners[1]?.(createPoseEvent(2));
    connectionListeners[0]?.('error');
    telemetryListeners[0]?.(createPoseEvent(999));
    await vi.advanceTimersByTimeAsync(200);

    expect(store.getSnapshot().connectionState).toBe('connected');
    expect(store.getSnapshot().pose?.sequence).toBe(2);

    store.stop();
    expect(unsubscribeTelemetry).toHaveBeenCalledTimes(2);
    expect(unsubscribeConnection).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('장시간 원시 입력에서도 알림과 raw 표본을 고정된 한도로 유지한다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1']);
    const store = new RobotTelemetryStore(adapter, 'robot-1');
    const listener = vi.fn();
    store.subscribe(listener);

    await store.start();
    await vi.advanceTimersByTimeAsync(60_000);
    const snapshot = store.getSnapshot();

    expect(listener).toHaveBeenCalledTimes(300);
    expect(snapshot.recentEvents).toHaveLength(40);

    store.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('연결 시작 실패 시 자원을 정리하고 error snapshot을 전달한다', async () => {
    const unsubscribeTelemetry = vi.fn();
    const unsubscribeConnection = vi.fn();
    const disconnect = vi.fn();
    const port: RobotTelemetryPort = {
      connect: () => Promise.reject(new Error('Telemetry 연결 실패')),
      disconnect,
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: () => unsubscribeTelemetry,
      subscribeConnection: () => unsubscribeConnection,
    };
    const store = new RobotTelemetryStore(port, 'robot-1');
    const listener = vi.fn();
    store.subscribe(listener);

    await expect(store.start()).rejects.toThrow('Telemetry 연결 실패');

    expect(store.getSnapshot().connectionState).toBe('error');
    expect(listener).toHaveBeenCalledOnce();
    expect(unsubscribeTelemetry).toHaveBeenCalledOnce();
    expect(unsubscribeConnection).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('동시에 호출한 start가 같은 실패를 모든 호출자에게 전달한다', async () => {
    const connect = vi.fn(() => Promise.reject(new Error('공유 연결 실패')));
    const port: RobotTelemetryPort = {
      connect,
      disconnect: vi.fn(),
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () => Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: () => () => undefined,
      subscribeConnection: () => () => undefined,
    };
    const store = new RobotTelemetryStore(port, 'robot-1');

    const first = store.start();
    const second = store.start();

    expect(second).toBe(first);
    await expect(first).rejects.toThrow('공유 연결 실패');
    await expect(second).rejects.toThrow('공유 연결 실패');
    expect(connect).toHaveBeenCalledOnce();
  });

  it('이전 Store의 지연 연결 정리를 마친 뒤 새 Store 연결을 시작한다', async () => {
    const firstConnection = createDeferred<void>();
    const events: string[] = [];
    const connect = vi
      .fn<RobotTelemetryPort['connect']>()
      .mockImplementationOnce(async () => {
        events.push('이전 연결 시작');
        await firstConnection.promise;
        events.push('이전 연결 완료');
      })
      .mockImplementationOnce(() => {
        events.push('새 연결 시작');
        return Promise.resolve();
      });
    const disconnect = vi.fn(() => events.push('연결 해제'));
    const port: RobotTelemetryPort = {
      connect,
      disconnect,
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () => Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: () => () => undefined,
      subscribeConnection: () => () => undefined,
    };
    const previousStore = new RobotTelemetryStore(port, 'robot-a');
    const nextStore = new RobotTelemetryStore(port, 'robot-b');

    const previousStart = previousStore.start();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    previousStore.stop();
    const nextStart = nextStore.start();
    expect(connect).toHaveBeenCalledOnce();

    firstConnection.resolve(undefined);
    await Promise.all([previousStart, nextStart]);

    expect(events.indexOf('새 연결 시작')).toBeGreaterThan(events.lastIndexOf('연결 해제'));
    expect(connect).toHaveBeenCalledTimes(2);
    nextStore.stop();
  });

  it('채널 초기화 실패도 부분 자원 없이 error snapshot으로 전달한다', async () => {
    const unsubscribeConnection = vi.fn();
    const connect = vi.fn(() => Promise.resolve());
    const port: RobotTelemetryPort = {
      connect,
      disconnect: vi.fn(),
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: () => {
        throw new Error('Telemetry 구독 실패');
      },
      subscribeConnection: () => unsubscribeConnection,
    };
    const store = new RobotTelemetryStore(port, 'robot-1');
    const listener = vi.fn();
    store.subscribe(listener);

    await expect(store.start()).rejects.toThrow('Telemetry 구독 실패');

    expect(store.getSnapshot().connectionState).toBe('error');
    expect(listener).toHaveBeenCalledOnce();
    expect(unsubscribeConnection).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop 뒤 늦게 성공한 connect를 다시 disconnect한다', async () => {
    const connection = createDeferred<void>();
    let active = false;
    const disconnect = vi.fn(() => {
      active = false;
    });
    const port: RobotTelemetryPort = {
      connect: async () => {
        await connection.promise;
        active = true;
      },
      disconnect,
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: () => () => undefined,
      subscribeConnection: () => () => undefined,
    };
    const store = new RobotTelemetryStore(port, 'robot-1');

    const start = store.start();
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    store.stop();
    connection.resolve(undefined);
    await start;

    expect(active).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Telemetry 구독 해제가 실패해도 나머지 listener와 timer, lease를 정리한다', async () => {
    const unsubscribeTelemetry = vi.fn(() => {
      throw new Error('Telemetry 구독 해제 실패');
    });
    const unsubscribeConnection = vi.fn();
    const disconnect = vi.fn();
    const port: RobotTelemetryPort = {
      connect: () => Promise.resolve(),
      disconnect,
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: () => unsubscribeTelemetry,
      subscribeConnection: () => unsubscribeConnection,
    };
    const store = new RobotTelemetryStore(port, 'robot-1');
    await store.start();

    expect(() => store.stop()).not.toThrow();

    expect(unsubscribeTelemetry).toHaveBeenCalledOnce();
    expect(unsubscribeConnection).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
