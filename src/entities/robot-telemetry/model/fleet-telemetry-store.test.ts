import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryTelemetryAdapter } from '../api/in-memory-telemetry';
import type {
  RobotPoseTelemetryEvent,
  RobotTelemetryEvent,
  TelemetryConnectionState,
} from './robot-telemetry';
import type { RobotTelemetryPort } from './robot-telemetry-port';
import { FleetTelemetryStore } from './fleet-telemetry-store';

function createDeferred() {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function createPoseEvent(
  robotId: string,
  sequence: number,
): RobotPoseTelemetryEvent {
  const timestampMs = sequence * 50;
  return {
    schemaVersion: 1,
    eventId: `telemetry-${robotId}-pose-${String(sequence)}`,
    robotId,
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

describe('FleetTelemetryStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('8대 원시 Telemetry를 하나의 최대 5Hz snapshot으로 배치한다', async () => {
    const robotIds = Array.from({ length: 8 }, (_, index) => `robot-${index + 1}`);
    const adapter = new InMemoryTelemetryAdapter(robotIds);
    const store = new FleetTelemetryStore(adapter, robotIds);
    const listener = vi.fn();
    store.subscribe(listener);

    await store.start();
    await vi.advanceTimersByTimeAsync(1200);
    const snapshot = store.getSnapshot();
    store.stop();

    expect(listener).toHaveBeenCalledTimes(6);
    expect(Object.keys(snapshot.robots)).toHaveLength(8);
    expect(Object.values(snapshot.robots).every((robot) => robot.pose !== null)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('out-of-order 이벤트가 Fleet의 최신 Pose를 되돌리지 않는다', async () => {
    let emitTelemetry: (event: RobotTelemetryEvent) => void = () => undefined;
    const port: RobotTelemetryPort = {
      connect: () => Promise.resolve(),
      disconnect: vi.fn(),
      getChannelDescriptors: () => Promise.resolve([]),
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
    const store = new FleetTelemetryStore(port, ['robot-1']);
    await store.start();

    emitTelemetry(createPoseEvent('robot-1', 2));
    emitTelemetry({
      ...createPoseEvent('robot-1', 1),
      receivedTimestampMs: 150,
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(store.getSnapshot().robots['robot-1']?.pose?.sequence).toBe(2);
    store.stop();
  });

  it('connect가 지연된 Strict Mode식 start-stop-start에서도 중복 자원을 남기지 않는다', async () => {
    const firstConnection = createDeferred();
    const unsubscribeTelemetry = vi.fn();
    const unsubscribeConnection = vi.fn();
    const connect = vi
      .fn<RobotTelemetryPort['connect']>()
      .mockImplementationOnce(() => firstConnection.promise)
      .mockResolvedValueOnce();
    const disconnect = vi.fn();
    const subscribe = vi.fn(() => unsubscribeTelemetry);
    const subscribeConnection = vi.fn(() => unsubscribeConnection);
    const port: RobotTelemetryPort = {
      connect,
      disconnect,
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe,
      subscribeConnection,
    };
    const store = new FleetTelemetryStore(port, ['robot-1']);

    const firstStart = store.start();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    store.stop();
    const restarted = store.start();
    firstConnection.resolve();
    await Promise.all([firstStart, restarted]);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribeConnection).toHaveBeenCalledTimes(2);
    expect(unsubscribeTelemetry).toHaveBeenCalledOnce();
    expect(unsubscribeConnection).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    store.stop();
    expect(unsubscribeTelemetry).toHaveBeenCalledTimes(2);
    expect(unsubscribeConnection).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
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
    const store = new FleetTelemetryStore(port, ['robot-1']);

    await store.start();
    store.stop();
    await store.start();

    connectionListeners[1]?.('connected');
    telemetryListeners[1]?.(createPoseEvent('robot-1', 2));
    connectionListeners[0]?.('error');
    telemetryListeners[0]?.(createPoseEvent('robot-1', 999));
    await vi.advanceTimersByTimeAsync(200);

    expect(store.getSnapshot().connectionState).toBe('connected');
    expect(store.getSnapshot().robots['robot-1']?.pose?.sequence).toBe(2);

    store.stop();
    expect(unsubscribeTelemetry).toHaveBeenCalledTimes(2);
    expect(unsubscribeConnection).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('구독 대상이 아닌 Robot 이벤트를 bounded snapshot에 추가하지 않는다', async () => {
    let listener: ((event: RobotTelemetryEvent) => void) | undefined;
    const port: RobotTelemetryPort = {
      connect: () => Promise.resolve(),
      disconnect: vi.fn(),
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: (_subscription, nextListener) => {
        listener = nextListener;
        return () => undefined;
      },
      subscribeConnection: () => () => undefined,
    };
    const store = new FleetTelemetryStore(port, ['robot-1']);

    await store.start();
    listener?.(createPoseEvent('robot-out-of-scope', 1));
    listener?.(createPoseEvent('robot-1', 2));
    await vi.advanceTimersByTimeAsync(200);

    expect(Object.keys(store.getSnapshot().robots)).toEqual(['robot-1']);
    expect(store.getSnapshot().robots['robot-1']?.pose?.sequence).toBe(2);
    store.stop();
  });

  it('부분 구독 실패를 정리하고 error snapshot으로 전달한다', async () => {
    const unsubscribeConnection = vi.fn();
    const connect = vi.fn(() => Promise.resolve());
    const port: RobotTelemetryPort = {
      connect,
      disconnect: vi.fn(),
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () =>
        Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: () => {
        throw new Error('Fleet 구독 실패');
      },
      subscribeConnection: () => unsubscribeConnection,
    };
    const store = new FleetTelemetryStore(port, ['robot-1']);
    const listener = vi.fn();
    store.subscribe(listener);

    await expect(store.start()).rejects.toThrow('Fleet 구독 실패');

    expect(store.getSnapshot().connectionState).toBe('error');
    expect(listener).toHaveBeenCalledOnce();
    expect(unsubscribeConnection).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop 뒤 늦게 성공한 connect를 다시 disconnect한다', async () => {
    const connection = createDeferred();
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
    const store = new FleetTelemetryStore(port, ['robot-1']);

    const start = store.start();
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    store.stop();
    connection.resolve();
    await start;

    expect(active).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('connection 구독 해제가 실패해도 나머지 구독과 timer, lease를 정리한다', async () => {
    const unsubscribeTelemetry = vi.fn();
    const unsubscribeConnection = vi.fn(() => {
      throw new Error('connection 구독 해제 실패');
    });
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
    const store = new FleetTelemetryStore(port, ['robot-1']);
    await store.start();

    expect(() => store.stop()).not.toThrow();

    expect(unsubscribeTelemetry).toHaveBeenCalledOnce();
    expect(unsubscribeConnection).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
