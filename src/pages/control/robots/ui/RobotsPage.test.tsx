import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryRobotCatalogWithData,
  RobotCatalogContext,
  RobotOperationalStatusContext,
  type RobotCatalogPort,
  type RobotDescriptor,
  type RobotOperationalStatusQueryPort,
} from '@/entities/robot';

import { RobotsPage } from './RobotsPage';

const operationalStatus: RobotOperationalStatusQueryPort = {
  listOperationalDataSources: () => Promise.resolve([]),
  getOperationalStatus: (robotId) => Promise.resolve({
    robotId,
    integrationProfileId: 'patrol-rest-v1',
    receivedTimestampMs: 1_700_000_000_000,
    data: {
      id: 246,
      serialNumber: 'MOCK00001',
      name: '405',
      nickname: 'Mock Robot',
      battery: 100,
      isConnecting: true,
      latitude: 0,
      longitude: 0,
      isCharging: false,
    },
  }),
};

function LocationSearchProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function renderPage(
  initialEntry = '/control/robots',
  catalog: RobotCatalogPort = createInMemoryRobotCatalogWithData(),
  status: RobotOperationalStatusQueryPort = operationalStatus,
) {
  return render(
    <RobotCatalogContext.Provider value={catalog}>
      <RobotOperationalStatusContext.Provider value={status}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LocationSearchProbe />
          <RobotsPage />
        </MemoryRouter>
      </RobotOperationalStatusContext.Provider>
    </RobotCatalogContext.Provider>,
  );
}

describe('RobotsPage', () => {
  it('페이지 조회 갱신 중에도 표와 Pagination 포커스를 유지한다', async () => {
    const user = userEvent.setup();
    const robots = Array.from({ length: 21 }, (_, index): RobotDescriptor => ({
      id: `robot-focus-${String(index + 1)}`,
      serialNumber: `FOCUS${String(index + 1)}`,
      name: `포커스 로봇 ${String(index + 1)}`,
      displayName: `포커스 로봇 ${String(index + 1)}`,
      integrationProfileId: 'profile-focus',
    }));
    let resolveNextPage: (
      result: Awaited<ReturnType<RobotCatalogPort['queryRobots']>>,
    ) => void = () => undefined;
    const pendingNextPage = new Promise<
      Awaited<ReturnType<RobotCatalogPort['queryRobots']>>
    >((resolve) => {
      resolveNextPage = resolve;
    });
    const firstPage = {
      items: robots.slice(0, 20),
      page: 1,
      pageSize: 20,
      totalItems: robots.length,
      totalPages: 2,
    };
    const queryRobots = vi
      .fn<RobotCatalogPort['queryRobots']>()
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => pendingNextPage);
    const catalog: RobotCatalogPort = {
      listRobots: () => Promise.resolve(robots),
      queryRobots,
      getRobot: (robotId) => Promise.resolve(
        robots.find((robot) => robot.id === robotId) ?? null,
      ),
    };
    renderPage('/control/robots', catalog);

    await screen.findByText('포커스 로봇 1');
    const nextPage = screen.getByRole('button', { name: '다음' });
    await user.click(nextPage);

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '로봇 목록' })).toBeInTheDocument();
    expect(nextPage).toHaveFocus();
    expect(nextPage).toHaveAttribute('aria-disabled', 'true');

    await act(async () => {
      resolveNextPage({
        items: robots.slice(20),
        page: 2,
        pageSize: 20,
        totalItems: robots.length,
        totalPages: 2,
      });
      await pendingNextPage;
    });
  });

  it('운영 상태를 한국어로 표시한다', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: '로봇 관리' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('status', { name: '실시간 상태: 확인 미지원' }),
    ).toHaveAttribute('aria-atomic', 'true');
    expect(screen.queryByRole('button', { name: '상태 새로고침' })).not.toBeInTheDocument();
    expect(screen.getAllByText('로봇 온라인')).toHaveLength(8);
    expect(screen.getAllByText('N0000001').length).toBeGreaterThan(0);
    expect(screen.queryByText('사족 보행형')).not.toBeInTheDocument();
    expect(screen.queryByText('위치 텔레메트리')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /\b(?:connected|waiting|disconnected)\b/,
    );
  });

  it('상태 stream 실패 시 기존 결과와 Retry를 제공한다', async () => {
    const user = userEvent.setup();
    let streamListener: Parameters<
      NonNullable<RobotOperationalStatusQueryPort['subscribeOperationalStatuses']>
    >[1] = () => undefined;
    const getOperationalStatus = vi.fn((robotId: string) => (
      operationalStatus.getOperationalStatus(robotId)
    ));
    const status: RobotOperationalStatusQueryPort = {
      ...operationalStatus,
      getOperationalStatus,
      subscribeOperationalStatuses: (_robotIds, listener) => {
        streamListener = listener;
        return () => undefined;
      },
    };
    renderPage('/control/robots', createInMemoryRobotCatalogWithData(), status);
    await screen.findByRole('status', { name: '실시간 연결: 확인 중' });
    const initialRequestCount = getOperationalStatus.mock.calls.length;

    act(() => streamListener({
      kind: 'stale',
      lastSuccessfulAtMs: 1_700_000_000_000,
      message: '게이트웨이 연결이 끊겼습니다.',
      reason: 'gateway-unreachable',
      robotId: 'robot-001',
    }));

    expect(await screen.findByRole('status', {
      name: '실시간 연결: 끊김',
    })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '실시간 연결 끊김' }))
      .toBeInTheDocument();
    expect(screen.getByText('상태 확인 불가')).toBeInTheDocument();
    expect(screen.getByText('마지막 상태: 로봇 온라인')).toBeInTheDocument();
    expect(screen.queryByText(/최신 로봇 상태를 반영하지 못했습니다/)).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: '로봇 목록' })).toBeInTheDocument();
    expect(getOperationalStatus).toHaveBeenCalledTimes(initialRequestCount);

    await user.click(screen.getByRole('button', { name: '연결 다시 확인' }));
    await waitFor(() => {
      expect(getOperationalStatus).toHaveBeenCalledTimes(initialRequestCount * 2);
    });
  });

  it('all 검색 문자열을 URL Query에 보존하고 입력 포커스를 유지한다', async () => {
    const user = userEvent.setup();
    renderPage();
    const search = await screen.findByRole('searchbox', { name: '로봇 검색' });

    await user.type(search, 'all');

    expect(search).toHaveValue('all');
    expect(search).toHaveFocus();
    expect(screen.getByTestId('location-search')).toHaveTextContent('?search=all');
    expect(
      await screen.findByText('조건에 맞는 로봇이 없습니다.'),
    ).toBeInTheDocument();
  });

  it('지원하지 않는 필터를 URL에서 제거하고 검색 문자열은 보존한다', async () => {
    renderPage('/control/robots?search=all&status=connected');

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?search=all');
      expect(screen.getByTestId('location-search')).not.toHaveTextContent('status=');
    });
    expect(screen.getByRole('searchbox', { name: '로봇 검색' })).toHaveValue('all');
  });
});
