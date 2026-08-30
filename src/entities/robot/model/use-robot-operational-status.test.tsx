import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RobotOperationalStatusContext } from './robot-operational-status-context';
import type {
  RobotOperationalStatus,
  RobotOperationalStatusQueryPort,
  RobotOperationalStatusSubscriptionEvent,
} from './robot-operational-status';
import { useRobotOperationalStatus } from './use-robot-operational-status';

const status: RobotOperationalStatus = {
  robotId: 'robot-01',
  integrationProfileId: 'patrol-rest-v1',
  receivedTimestampMs: 1_700_000_000_000,
  data: {
    id: 246,
    serialNumber: 'ROBOT0001',
    name: '405',
    nickname: '테스트 로봇',
    battery: 80,
    isConnecting: true,
    isCharging: false,
    latitude: 37.5,
    longitude: 127,
  },
};

describe('useRobotOperationalStatus', () => {
  it('stream 실패는 기존 결과를 유지하고 명시적 Retry에서만 다시 조회한다', async () => {
    let streamListener: (event: RobotOperationalStatusSubscriptionEvent) => void = () => undefined;
    const unsubscribe = vi.fn();
    const subscribeOperationalStatuses = vi.fn<
      NonNullable<RobotOperationalStatusQueryPort['subscribeOperationalStatuses']>
    >((_robotIds, listener) => {
      streamListener = listener;
      return unsubscribe;
    });
    const getOperationalStatus = vi.fn(() => Promise.resolve(status));
    const port: RobotOperationalStatusQueryPort = {
      getOperationalStatus,
      listOperationalDataSources: () => Promise.resolve([]),
      subscribeOperationalStatuses,
    };
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <RobotOperationalStatusContext.Provider value={port}>
        {children}
      </RobotOperationalStatusContext.Provider>
    );
    const { result, unmount } = renderHook(
      () => useRobotOperationalStatus('robot-01'),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: status,
      refreshError: null,
      streamStatus: 'connecting',
    }));
    expect(getOperationalStatus).toHaveBeenCalledOnce();

    act(() => streamListener({
      kind: 'stale',
      lastSuccessfulAtMs: status.receivedTimestampMs,
      message: '오프라인',
      robotId: 'robot-01',
    }));

    expect(result.current).toMatchObject({
      status: 'ready',
      data: status,
      refreshError: '오프라인',
      streamStatus: 'stale',
    });
    expect(getOperationalStatus).toHaveBeenCalledOnce();

    act(() => result.current.retry());
    expect(result.current.streamStatus).toBe('connecting');
    await waitFor(() => expect(getOperationalStatus).toHaveBeenCalledTimes(2));
    expect(subscribeOperationalStatuses).toHaveBeenCalledTimes(2);

    act(() => streamListener({ kind: 'updated', robotId: 'robot-01' }));
    await waitFor(() => {
      expect(result.current.refreshError).toBeNull();
      expect(result.current.streamStatus).toBe('online');
      expect(getOperationalStatus).toHaveBeenCalledTimes(3);
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
