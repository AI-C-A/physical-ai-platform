import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AsyncQueryState } from '@/shared/lib/async-query';

import type { RobotDescriptor } from '../model/robot';
import type { RobotOperationalStatus } from '../model/robot-operational-status';
import { RobotInfoTable } from './RobotInfoTable';

const robot: RobotDescriptor = {
  id: 'robot-01',
  serialNumber: 'ROBOT0001',
  name: '테스트 로봇',
  displayName: '테스트 로봇',
  integrationProfileId: 'patrol-rest-v1',
};

describe('RobotInfoTable', () => {
  it('stream 갱신 실패 시 오프라인 상태와 재연결을 제공한다', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const operationalStatus: AsyncQueryState<RobotOperationalStatus | null> = {
      status: 'ready',
      data: {
        robotId: robot.id,
        integrationProfileId: robot.integrationProfileId,
        receivedTimestampMs: 1_700_000_000_000,
        data: {
          id: 246,
          serialNumber: robot.serialNumber,
          name: '405',
          nickname: robot.displayName,
          battery: 80,
          isConnecting: true,
          isAvailable: true,
          isCharging: false,
          isMovable: true,
          latitude: 37.5,
          longitude: 127,
        },
      },
      isRefreshing: false,
      refreshError: '오프라인',
      retry,
    };

    render(<RobotInfoTable operationalStatus={operationalStatus} robot={robot} />);

    expect(screen.getByRole('table', { name: '테스트 로봇 로봇 정보' })).toBeInTheDocument();
    expect(screen.getByText('오프라인')).toBeInTheDocument();
    expect(screen.queryByText(/기존 결과를 유지했습니다/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 연결' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
