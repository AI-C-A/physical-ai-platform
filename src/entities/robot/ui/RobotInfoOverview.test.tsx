import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AsyncQueryState } from '@/shared/lib/async-query';

import type { RobotDescriptor } from '../model/robot';
import type {
  PatrolRobotSnapshot,
  RobotOperationalStatus,
} from '../model/robot-operational-status';
import { RobotInfoOverview } from './RobotInfoOverview';

const robot: RobotDescriptor = {
  id: 'robot-01',
  serialNumber: 'ROBOT0001',
  name: '테스트 로봇',
  displayName: '테스트 로봇',
  integrationProfileId: 'patrol-rest-v1',
};

const baseSnapshot: PatrolRobotSnapshot = {
  id: 246,
  serialNumber: robot.serialNumber,
  name: '405',
  nickname: robot.displayName,
  battery: 80,
  isConnecting: true,
  isCharging: false,
  latitude: 37.5,
  longitude: 127,
};

function createReadyState(
  data: Partial<PatrolRobotSnapshot> = {},
  refreshError: string | null = null,
  retry = vi.fn(),
): AsyncQueryState<RobotOperationalStatus | null> {
  return {
    status: 'ready',
    data: {
      robotId: robot.id,
      integrationProfileId: robot.integrationProfileId,
      receivedTimestampMs: 1_700_000_000_000,
      data: { ...baseSnapshot, ...data },
    },
    isRefreshing: false,
    refreshError,
    retry,
  };
}

describe('RobotInfoOverview', () => {
  it('raw 필드 대신 배터리, 상태, 식별 정보와 위치를 의미 있게 표시한다', () => {
    render(
      <RobotInfoOverview
        operationalStatus={createReadyState({ battery: 80.25 })}
        robot={robot}
      />,
    );

    const overview = screen.getByRole('region', { name: '테스트 로봇 로봇 정보' });
    const batteryStatus = within(overview).getByRole('group', {
      name: '배터리 80.3%',
    });
    const currentLocation = within(overview).getByRole('region', {
      name: '현재 위치',
    });
    const batteryLabel = within(batteryStatus).getByText('배터리');
    const currentLocationTitle = within(currentLocation).getByRole('heading', {
      name: '현재 위치',
    });
    expect(within(overview).queryByRole('table')).not.toBeInTheDocument();
    expect(within(overview).queryByRole('group', { name: '연결 상태' }))
      .not.toBeInTheDocument();
    expect(within(overview).queryByText('로봇 온라인')).not.toBeInTheDocument();
    const batteryValue = within(batteryStatus).getByText('80.3%');
    const batteryGauge = within(batteryStatus).getByRole('progressbar', {
      name: '배터리 잔량',
    });
    expect(batteryGauge).toHaveAttribute('aria-valuenow', '80.25');
    expect(batteryGauge).toHaveAttribute('aria-valuetext', '80.3%');
    expect(batteryGauge).toHaveClass(
      'h-2.5',
      'rounded-full',
      'bg-foreground/10',
    );
    expect(batteryStatus).toHaveClass(
      'rounded-md',
      'bg-foreground/[0.035]',
      'text-foreground',
    );
    expect(batteryStatus).not.toHaveClass('shadow-sm');
    expect(batteryValue).toHaveClass('text-3xl', 'font-light');
    expect(batteryGauge).not.toContainElement(batteryValue);
    const batteryFill = batteryGauge.querySelector('[data-battery-fill]');
    expect(batteryFill).toHaveStyle({ width: '80.25%' });
    expect(batteryFill).toHaveClass('bg-foreground', 'rounded-full');
    expect(batteryLabel).not.toHaveClass(
      'uppercase',
      'tracking-[0.16em]',
    );
    expect(batteryLabel).toHaveClass('text-xs', 'font-medium', 'text-muted');
    expect(currentLocationTitle).toHaveClass(
      'text-xs',
      'font-medium',
      'text-muted',
    );
    expect(batteryStatus.querySelector('.lucide-battery')).not.toBeInTheDocument();
    expect(batteryStatus.querySelector('.lucide-zap')).not.toBeInTheDocument();
    expect(batteryStatus.querySelector('[data-battery-icon-fill]'))
      .not.toBeInTheDocument();
    expect(within(batteryStatus).queryByText('에너지')).not.toBeInTheDocument();
    expect(within(batteryStatus).queryByText('배터리 잔량')).not.toBeInTheDocument();
    expect(within(overview).queryByText('충전 안 함')).not.toBeInTheDocument();
    for (const statusDescription of [
      '상태 신호 없음',
      '임무 투입 가능',
      '점검 후 투입',
      '주행 준비 완료',
      '이동 제한 상태',
    ]) {
      expect(within(overview).queryByText(statusDescription))
        .not.toBeInTheDocument();
    }
    for (const redundantLabel of ['실시간 연결', 'GPS 좌표']) {
      expect(within(overview).queryByText(redundantLabel, { exact: true }))
        .not.toBeInTheDocument();
    }
    expect(within(overview).getByText('ROBOT0001')).toBeInTheDocument();
    for (const detailLabel of ['위도', '경도', '일련번호', '시스템 이름']) {
      expect(within(overview).getByText(detailLabel)).not.toHaveClass(
        'uppercase',
        'tracking-[0.12em]',
      );
    }
    expect(within(overview).getByText('37.5° N')).toBeInTheDocument();
    expect(within(overview).getByText('127° E')).toBeInTheDocument();
    expect(currentLocation).toHaveClass(
      'rounded-md',
      'bg-foreground/[0.035]',
      'p-4',
    );
    expect(currentLocation).not.toHaveClass('border', 'shadow-sm');
    expect(currentLocation.querySelector('.lucide-map-pin')).not.toBeInTheDocument();
    expect(within(currentLocation).getByText('위도').parentElement)
      .not.toHaveClass('rounded-md', 'bg-neutral-100');
    expect(within(currentLocation).getByText('경도').parentElement)
      .not.toHaveClass('rounded-md', 'bg-neutral-100');
    const identity = within(overview).getByRole('region', {
      name: '기체 식별 정보',
    });
    expect(identity).toHaveClass(
      'rounded-md',
      'bg-foreground/[0.035]',
      'p-4',
    );
    expect(identity).not.toHaveClass('border', 'shadow-sm');
    expect(identity.querySelector('svg')).not.toBeInTheDocument();
    expect(within(identity).queryByText('기체 정보')).not.toBeInTheDocument();
    expect(within(identity).queryByText('UNIT 246')).not.toBeInTheDocument();
    const cardSurfaces = overview.querySelectorAll('[data-card-surface]');
    expect(cardSurfaces).toHaveLength(3);
    for (const cardSurface of cardSurfaces) {
      expect(cardSurface.querySelector('[data-card-surface]')).toBeNull();
    }
    expect(within(overview).queryByText('별칭')).not.toBeInTheDocument();
    for (const rawValue of [
      'battery',
      'isConnecting',
      'true',
      'false',
      'null',
    ]) {
      expect(within(overview).queryByText(rawValue, { exact: true }))
        .not.toBeInTheDocument();
    }
  });

  it('null 값과 0·음수 좌표를 사람이 읽을 수 있는 값으로 표시한다', () => {
    const { rerender } = render(
      <RobotInfoOverview
        operationalStatus={createReadyState({
          battery: 12.34,
          isCharging: true,
          isConnecting: false,
          latitude: 0,
          longitude: -127.1234567,
          name: null,
          nickname: null,
          serialNumber: null,
        })}
        robot={robot}
      />,
    );

    const overview = screen.getByRole('region', { name: '테스트 로봇 로봇 정보' });
    const chargingBattery = within(overview).getByRole('group', {
      name: '배터리 12.3%, 충전 중',
    });
    expect(chargingBattery.querySelector('.lucide-zap'))
      .toBeInTheDocument();
    const chargingStatus = within(chargingBattery).getByRole('img', {
      name: '충전 중',
    });
    const chargingIcon = chargingBattery.querySelector<SVGElement>('.lucide-zap');
    const batteryValue = within(chargingBattery).getByText('12.3%');
    expect(chargingStatus).toContainElement(
      chargingIcon,
    );
    expect(chargingIcon).toHaveAttribute('fill', 'currentColor');
    expect(chargingStatus.nextElementSibling).toBe(batteryValue);
    expect(batteryValue.parentElement).toHaveClass(
      'flex',
      'items-center',
      'gap-2',
    );
    expect(chargingStatus).toHaveClass(
      'inline-flex',
      'shrink-0',
      'text-status-positive-foreground',
    );
    expect(batteryValue).not.toHaveClass('text-status-positive-foreground');
    expect(chargingStatus).not.toHaveClass('rounded-full', 'bg-white/10');
    expect(chargingStatus).not.toHaveClass('size-8', 'place-items-center');
    const chargingGauge = within(chargingBattery).getByRole('progressbar', {
      name: '배터리 잔량',
    });
    expect(chargingGauge).toHaveAttribute('aria-valuetext', '12.3%');
    expect(chargingGauge.querySelector('[data-battery-fill]'))
      .toHaveClass('bg-status-positive-foreground');
    expect(chargingBattery.querySelector('.lucide-battery-charging'))
      .not.toBeInTheDocument();
    expect(chargingBattery.querySelector('[data-battery-icon-fill]'))
      .not.toBeInTheDocument();
    const offlineConnection = within(overview).getByRole('group', {
      name: '연결 상태',
    });
    const offlineStatus = within(offlineConnection).getByRole('status');
    expect(within(offlineConnection).queryByText('연결 상태'))
      .not.toBeInTheDocument();
    expect(offlineStatus).toHaveTextContent('로봇 오프라인');
    expect(offlineStatus).toHaveClass(
      'flex',
      'items-center',
      'gap-2',
      'text-sm',
      'font-medium',
      'text-negative',
    );
    expect(offlineStatus).not.toHaveClass('mt-1');
    expect(offlineStatus).not.toHaveClass('rounded-full', 'bg-red-50', 'px-2');
    expect(offlineStatus.querySelector('.lucide-wifi-off')).toBeInTheDocument();
    expect(within(overview).queryByText('충전 중')).not.toBeInTheDocument();
    expect(within(overview).getAllByText('미등록')).toHaveLength(2);
    expect(within(overview).getByText('0° N')).toBeInTheDocument();
    expect(within(overview).getByText('127.123457° W')).toBeInTheDocument();

    rerender(
      <RobotInfoOverview
        operationalStatus={createReadyState({ latitude: null, longitude: null })}
        robot={robot}
      />,
    );
    expect(screen.getByText('GPS 신호를 수신하지 못했습니다.'))
      .toBeInTheDocument();

    rerender(
      <RobotInfoOverview
        operationalStatus={createReadyState({ latitude: 0, longitude: 0 })}
        robot={robot}
      />,
    );
    expect(screen.getByText('GPS 신호를 수신하지 못했습니다.'))
      .toBeInTheDocument();
  });

  it('stream 갱신 실패 시 마지막 정보와 재연결 동작을 유지한다', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <RobotInfoOverview
        operationalStatus={{
          ...createReadyState({}, '게이트웨이 연결이 끊겼습니다.', retry),
          streamIssue: {
            lastSuccessfulAtMs: 1_700_000_000_000,
            message: '게이트웨이 연결이 끊겼습니다.',
            reason: 'gateway-unreachable',
          },
        }}
        robot={robot}
      />,
    );

    expect(screen.getByRole('region', { name: '테스트 로봇 로봇 정보' }))
      .toBeInTheDocument();
    expect(screen.getByRole('region', { name: '실시간 연결 끊김' }))
      .toBeInTheDocument();
    expect(screen.queryByText('마지막 상태: 로봇 온라인'))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '연결 상태' }))
      .not.toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '연결 다시 확인' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('초기 조회 오류와 데이터 없음 상태를 기존 동작대로 처리한다', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { rerender } = render(
      <RobotInfoOverview
        operationalStatus={{
          status: 'error',
          message: '운영 정보를 불러오지 못했습니다.',
          isRefreshing: false,
          refreshError: null,
          retry,
        }}
        robot={robot}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '운영 정보를 불러오지 못했습니다.',
    );
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <RobotInfoOverview
        operationalStatus={{
          status: 'ready',
          data: null,
          isRefreshing: false,
          refreshError: null,
          retry,
        }}
        robot={robot}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '운영 정보가 제공되지 않았습니다.',
    );
  });
});
