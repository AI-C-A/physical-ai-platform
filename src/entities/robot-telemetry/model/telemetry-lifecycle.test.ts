import { describe, expect, it, vi } from 'vitest';

import { FleetTelemetryStore } from './fleet-telemetry-store';
import type { RobotTelemetryEvent, TelemetryConnectionState } from './robot-telemetry';
import type { RobotTelemetryPort } from './robot-telemetry-port';
import { RobotTelemetryStore } from './robot-telemetry-store';
import { acquireTelemetryConnection } from './telemetry-lifecycle';

function createDeferred() {
  let rejectPromise: (reason: unknown) => void = () => undefined;
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

function createPort(
  connect: RobotTelemetryPort['connect'],
  disconnect: RobotTelemetryPort['disconnect'],
): RobotTelemetryPort {
  return {
    connect,
    disconnect,
    getChannelDescriptors: () => Promise.resolve([]),
    getExecutionSource: () => Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
    subscribe: () => () => undefined,
    subscribeConnection: () => () => undefined,
  };
}

describe('telemetry connection lifecycle', () => {
  it('같은 Port를 쓰는 두 Store 중 하나가 멈춰도 남은 Store의 연결과 구독을 유지한다', async () => {
    const telemetryListeners = new Set<(event: RobotTelemetryEvent) => void>();
    const connectionListeners = new Set<(state: TelemetryConnectionState) => void>();
    const connect = vi.fn<RobotTelemetryPort['connect']>(() => Promise.resolve());
    const disconnect = vi.fn<RobotTelemetryPort['disconnect']>();
    const port: RobotTelemetryPort = {
      connect,
      disconnect,
      getChannelDescriptors: () => Promise.resolve([]),
      getExecutionSource: () => Promise.resolve({ environment: 'physical', deliveryMode: 'live' }),
      subscribe: (_subscription, listener) => {
        telemetryListeners.add(listener);
        return () => telemetryListeners.delete(listener);
      },
      subscribeConnection: (listener) => {
        connectionListeners.add(listener);
        return () => connectionListeners.delete(listener);
      },
    };
    const detailStore = new RobotTelemetryStore(port, 'robot-1');
    const fleetStore = new FleetTelemetryStore(port, ['robot-1']);

    await Promise.all([detailStore.start(), fleetStore.start()]);

    expect(connect).toHaveBeenCalledOnce();
    expect(telemetryListeners).toHaveLength(2);
    expect(connectionListeners).toHaveLength(2);

    detailStore.stop();

    expect(disconnect).not.toHaveBeenCalled();
    expect(telemetryListeners).toHaveLength(1);
    expect(connectionListeners).toHaveLength(1);

    fleetStore.stop();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(telemetryListeners).toHaveLength(0);
    expect(connectionListeners).toHaveLength(0);
  });

  it('pending connect의 마지막 lease 해제와 새 lease 취득을 오래된 정리 뒤에 직렬화한다', async () => {
    const firstConnection = createDeferred();
    const secondConnection = createDeferred();
    const events: string[] = [];
    const connect = vi.fn<RobotTelemetryPort['connect']>()
      .mockImplementationOnce(() => {
        events.push('connect:first');
        return firstConnection.promise;
      })
      .mockImplementationOnce(() => {
        events.push('connect:second');
        return secondConnection.promise;
      });
    const disconnect = vi.fn<RobotTelemetryPort['disconnect']>(() => {
      events.push('disconnect');
    });
    const port = createPort(connect, disconnect);
    const firstLease = acquireTelemetryConnection(port);

    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    firstLease.release();
    const secondLease = acquireTelemetryConnection(port);

    expect(disconnect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();

    firstConnection.resolve();
    await firstLease.connected;
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2));

    expect(events).toEqual([
      'connect:first',
      'disconnect',
      'disconnect',
      'connect:second',
    ]);

    secondConnection.resolve();
    await secondLease.connected;
    secondLease.release();

    expect(disconnect).toHaveBeenCalledTimes(3);
  });

  it('공유 connect 실패는 모든 lease를 해제하고 다음 취득에서 새로 연결한다', async () => {
    const failure = new Error('Telemetry 연결 실패');
    const connect = vi.fn<RobotTelemetryPort['connect']>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const disconnect = vi.fn<RobotTelemetryPort['disconnect']>();
    const port = createPort(connect, disconnect);
    const firstLease = acquireTelemetryConnection(port);
    const secondLease = acquireTelemetryConnection(port);

    const results = await Promise.allSettled([
      firstLease.connected,
      secondLease.connected,
    ]);

    expect(results).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ]);
    expect(connect).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();

    firstLease.release();
    secondLease.release();
    expect(disconnect).toHaveBeenCalledOnce();

    const retryLease = acquireTelemetryConnection(port);
    await retryLease.connected;
    retryLease.release();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('마지막 lease 해제 중 disconnect 예외가 다음 연결 세대를 막지 않는다', async () => {
    const connect = vi.fn<RobotTelemetryPort['connect']>(() => Promise.resolve());
    const disconnect = vi.fn<RobotTelemetryPort['disconnect']>()
      .mockImplementationOnce(() => {
        throw new Error('Telemetry 해제 실패');
      })
      .mockImplementationOnce(() => undefined);
    const port = createPort(connect, disconnect);
    const firstLease = acquireTelemetryConnection(port);

    await firstLease.connected;
    expect(() => firstLease.release()).not.toThrow();

    const secondLease = acquireTelemetryConnection(port);
    await secondLease.connected;
    secondLease.release();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('connect 실패 정리 중 disconnect 예외가 원래 실패와 재시도를 가리지 않는다', async () => {
    const connectionFailure = new Error('Telemetry 연결 실패');
    const connect = vi.fn<RobotTelemetryPort['connect']>()
      .mockRejectedValueOnce(connectionFailure)
      .mockResolvedValueOnce(undefined);
    const disconnect = vi.fn<RobotTelemetryPort['disconnect']>()
      .mockImplementationOnce(() => {
        throw new Error('Telemetry 해제 실패');
      })
      .mockImplementationOnce(() => undefined);
    const port = createPort(connect, disconnect);
    const failedLease = acquireTelemetryConnection(port);

    await expect(failedLease.connected).rejects.toBe(connectionFailure);
    failedLease.release();

    const retryLease = acquireTelemetryConnection(port);
    await retryLease.connected;
    retryLease.release();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('오래된 connect 정리의 disconnect 예외 뒤에도 새 lease 연결을 시작한다', async () => {
    const firstConnection = createDeferred();
    const secondConnection = createDeferred();
    const connect = vi.fn<RobotTelemetryPort['connect']>()
      .mockImplementationOnce(() => firstConnection.promise)
      .mockImplementationOnce(() => secondConnection.promise);
    const disconnect = vi.fn<RobotTelemetryPort['disconnect']>(() => {
      throw new Error('Telemetry 해제 실패');
    });
    const port = createPort(connect, disconnect);
    const firstLease = acquireTelemetryConnection(port);

    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    expect(() => firstLease.release()).not.toThrow();
    const secondLease = acquireTelemetryConnection(port);

    firstConnection.resolve();
    await firstLease.connected;
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2));

    secondConnection.resolve();
    await secondLease.connected;
    expect(() => secondLease.release()).not.toThrow();

    expect(disconnect).toHaveBeenCalledTimes(3);
  });
});
