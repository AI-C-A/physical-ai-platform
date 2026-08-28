import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AnalyticsContext, type AnalyticsPort } from '@/entities/analytics';
import {
  createInMemoryRobotCatalogWithData,
  RobotCatalogContext,
  type RobotCatalogPort,
  type RobotDescriptor,
} from '@/entities/robot';
import { ClockContext, type ClockPort } from '@/shared/lib/clock';

import { BigDataOverviewPage } from './BigDataOverviewPage';

interface MockChartProps {
  readonly data: readonly {
    readonly id?: string;
    readonly label: string;
    readonly value: number;
  }[];
  readonly isPending?: boolean;
  readonly onDatumSelect?: (datum: {
    readonly id?: string;
    readonly label: string;
    readonly value: number;
  }) => void;
}

vi.mock('@/shared/ui/chart', () => ({
  Chart: ({ data, isPending = false, onDatumSelect }: MockChartProps) => <div>{data.map((datum) => <button aria-disabled={isPending} key={datum.label} onClick={() => { if (!isPending) onDatumSelect?.(datum); }} type="button">{datum.label} 상세</button>)}</div>,
}));

const clock: ClockPort = { nowMs: () => Date.parse('2026-08-21T09:00:00+09:00') };
const analytics: AnalyticsPort = {
  getOverview: () => Promise.resolve({ sessionCount: 10, successRatePercent: 80, bytesWritten: 1000, episodeCount: 8, datasetCount: 2, statusSeries: [{ label: 'completed', value: 8 }], trendSeries: [{ label: '8. 21.', value: 10 }] }),
  queryOperations: () => Promise.resolve({ records: [], groups: [] }),
  queryTelemetry: () => Promise.resolve({ bucketMs: 10_000, displayedPointCount: 0, points: [] }),
  subscribe: () => () => undefined,
};
const failedRobotCatalog: RobotCatalogPort = {
  listRobots: () => Promise.reject(new Error('로봇 목록 실패')),
  queryRobots: () => Promise.reject(new Error('사용하지 않는 조회')),
  getRobot: () => Promise.reject(new Error('사용하지 않는 조회')),
};

function createRobotCatalog(robots: readonly RobotDescriptor[]): RobotCatalogPort {
  return {
    listRobots: () => Promise.resolve(robots),
    queryRobots: (query) => Promise.resolve({
      items: robots,
      page: query.page,
      pageSize: query.pageSize,
      totalItems: robots.length,
      totalPages: 1,
    }),
    getRobot: (robotId) => Promise.resolve(
      robots.find((robot) => robot.id === robotId) ?? null,
    ),
  };
}

const collisionRobots: readonly RobotDescriptor[] = [
  {
    id: 'all',
    serialNumber: 'ALL001',
    name: 'ALL 실기체',
    displayName: 'ALL 실기체',
    integrationProfileId: 'profile-all',
  },
  {
    id: 'robot-002',
    serialNumber: 'MOCK00002',
    name: '두 번째 로봇',
    displayName: '두 번째 로봇',
    integrationProfileId: 'profile-002',
  },
];

function LocationProbe() {
  const location = useLocation();
  return <p>{`${location.pathname}${location.search}`}</p>;
}

describe('BigDataOverviewPage', () => {
  it('운영 집계 갱신 중에도 chart와 drilldown 포커스를 유지한다', async () => {
    let invalidate: (() => void) | undefined;
    const readyResult = {
      sessionCount: 10,
      successRatePercent: 80,
      bytesWritten: 1_000,
      episodeCount: 8,
      datasetCount: 2,
      statusSeries: [{ label: 'completed', value: 8 }],
      trendSeries: [{ label: '8. 21.', value: 10 }],
    };
    let resolveRefresh: (
      result: Awaited<ReturnType<AnalyticsPort['getOverview']>>,
    ) => void = () => undefined;
    const pendingRefresh = new Promise<
      Awaited<ReturnType<AnalyticsPort['getOverview']>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    const getOverview = vi
      .fn<AnalyticsPort['getOverview']>()
      .mockResolvedValueOnce(readyResult)
      .mockImplementationOnce(() => pendingRefresh);
    const refreshingAnalytics: AnalyticsPort = {
      ...analytics,
      getOverview,
      subscribe: (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    };
    render(<ClockContext.Provider value={clock}><AnalyticsContext.Provider value={refreshingAnalytics}><RobotCatalogContext.Provider value={createInMemoryRobotCatalogWithData()}><MemoryRouter initialEntries={['/bigdata/overview']}><BigDataOverviewPage /></MemoryRouter></RobotCatalogContext.Provider></AnalyticsContext.Provider></ClockContext.Provider>);

    const drilldown = await screen.findByRole('button', { name: '완료 상세' });
    drilldown.focus();
    await waitFor(() => expect(invalidate).toBeDefined());

    act(() => invalidate?.());

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '수집 세션 상태 분포' })).toBeInTheDocument();
    expect(drilldown).toHaveFocus();
    expect(drilldown).toHaveAttribute('aria-disabled', 'true');

    await act(async () => {
      resolveRefresh(readyResult);
      await pendingRefresh;
    });
  });

  it('Robot 목록 실패가 필터 없는 전체 운영 집계 조회와 결과 UI를 막지 않는다', async () => {
    const getOverview = vi.fn<AnalyticsPort['getOverview']>((query) =>
      analytics.getOverview(query));
    const partialAnalytics: AnalyticsPort = { ...analytics, getOverview };
    render(<ClockContext.Provider value={clock}><AnalyticsContext.Provider value={partialAnalytics}><RobotCatalogContext.Provider value={failedRobotCatalog}><MemoryRouter initialEntries={['/bigdata/overview']}><BigDataOverviewPage /></MemoryRouter></RobotCatalogContext.Provider></AnalyticsContext.Provider></ClockContext.Provider>);

    expect(await screen.findByText('80.0%')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '전체 로봇 기준 운영 집계는 유지했습니다',
    );
    expect(screen.getByRole('combobox', { name: '로봇' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '로봇 목록 다시 불러오기' }),
    ).toBeEnabled();
    expect(getOverview).toHaveBeenCalledWith(expect.objectContaining({ robotId: null }));
  });

  it('명시적 Robot 필터는 목록 검증 실패 시 운영 집계로 전달하지 않는다', async () => {
    const getOverview = vi.fn<AnalyticsPort['getOverview']>((query) =>
      analytics.getOverview(query));
    const guardedAnalytics: AnalyticsPort = { ...analytics, getOverview };
    render(<ClockContext.Provider value={clock}><AnalyticsContext.Provider value={guardedAnalytics}><RobotCatalogContext.Provider value={failedRobotCatalog}><MemoryRouter initialEntries={['/bigdata/overview?robot=robot-001']}><BigDataOverviewPage /></MemoryRouter></RobotCatalogContext.Provider></AnalyticsContext.Provider></ClockContext.Provider>);

    expect(await screen.findByRole('alert')).toHaveTextContent('로봇 목록을 불러오지 못했습니다.');
    expect(getOverview).not.toHaveBeenCalled();
  });

  it('변경 알림 재조회에서 이동 기간의 종료 시각을 새로 계산한다', async () => {
    let nowMs = Date.parse('2026-08-21T00:00:00Z');
    let listener: (() => void) | undefined;
    const movingClock: ClockPort = { nowMs: () => nowMs };
    const getOverview = vi.fn<AnalyticsPort['getOverview']>(() =>
      Promise.resolve({ sessionCount: 0, successRatePercent: null, bytesWritten: 0, episodeCount: 0, datasetCount: 0, statusSeries: [], trendSeries: [] }));
    const movingAnalytics: AnalyticsPort = {
      ...analytics,
      getOverview,
      subscribe: (nextListener) => {
        listener = nextListener;
        return () => undefined;
      },
    };
    render(<ClockContext.Provider value={movingClock}><AnalyticsContext.Provider value={movingAnalytics}><RobotCatalogContext.Provider value={createInMemoryRobotCatalogWithData()}><MemoryRouter initialEntries={['/bigdata/overview?range=1']}><BigDataOverviewPage /></MemoryRouter></RobotCatalogContext.Provider></AnalyticsContext.Provider></ClockContext.Provider>);
    await waitFor(() => expect(getOverview).toHaveBeenCalledOnce());

    nowMs += 3_600_000;
    act(() => listener?.());

    await waitFor(() => expect(getOverview).toHaveBeenCalledTimes(2));
    expect(getOverview.mock.calls[1]?.[0]).toMatchObject({
      endMs: nowMs,
      startMs: nowMs - 86_400_000,
    });
  });

  it('등록되지 않은 명시적 Robot ID를 전체 Fleet 조회로 바꾸지 않는다', async () => {
    const getOverview = vi.fn<AnalyticsPort['getOverview']>(() =>
      Promise.resolve({ sessionCount: 0, successRatePercent: null, bytesWritten: 0, episodeCount: 0, datasetCount: 0, statusSeries: [], trendSeries: [] }));
    const guardedAnalytics: AnalyticsPort = { ...analytics, getOverview };
    render(<ClockContext.Provider value={clock}><AnalyticsContext.Provider value={guardedAnalytics}><RobotCatalogContext.Provider value={createInMemoryRobotCatalogWithData()}><MemoryRouter initialEntries={['/bigdata/overview?robot=missing-robot']}><BigDataOverviewPage /></MemoryRouter></RobotCatalogContext.Provider></AnalyticsContext.Provider></ClockContext.Provider>);

    expect(await screen.findByRole('alert')).toHaveTextContent('missing-robot');
    expect(getOverview).not.toHaveBeenCalled();
  });

  it('상태 차트 drilldown을 Explorer URL query로 전달한다', async () => {
    const user = userEvent.setup();
    render(<ClockContext.Provider value={clock}><AnalyticsContext.Provider value={analytics}><RobotCatalogContext.Provider value={createInMemoryRobotCatalogWithData()}><MemoryRouter initialEntries={['/bigdata/overview']}><Routes><Route element={<BigDataOverviewPage />} path="/bigdata/overview" /><Route element={<LocationProbe />} path="/bigdata/explorer" /></Routes></MemoryRouter></RobotCatalogContext.Provider></AnalyticsContext.Provider></ClockContext.Provider>);
    await user.click(await screen.findByRole('button', { name: '완료 상세' }));
    expect(screen.getByText('/bigdata/explorer?mode=operations&type=session&status=completed&range=7')).toBeInTheDocument();
  });

  it('실제 Robot ID all을 전체 선택과 구분해 조회와 drilldown에 보존한다', async () => {
    const user = userEvent.setup();
    const getOverview = vi.fn<AnalyticsPort['getOverview']>((query) =>
      analytics.getOverview(query));
    const collisionAnalytics: AnalyticsPort = { ...analytics, getOverview };
    render(<ClockContext.Provider value={clock}><AnalyticsContext.Provider value={collisionAnalytics}><RobotCatalogContext.Provider value={createRobotCatalog(collisionRobots)}><MemoryRouter initialEntries={['/bigdata/overview?robot=all']}><Routes><Route element={<BigDataOverviewPage />} path="/bigdata/overview" /><Route element={<LocationProbe />} path="/bigdata/explorer" /></Routes></MemoryRouter></RobotCatalogContext.Provider></AnalyticsContext.Provider></ClockContext.Provider>);

    const robotSelect = await screen.findByRole('combobox', { name: '로봇' });
    expect(robotSelect).toHaveTextContent('ALL 실기체');
    expect(getOverview).toHaveBeenCalledWith(expect.objectContaining({ robotId: 'all' }));

    await user.click(screen.getByRole('button', { name: '완료 상세' }));
    expect(screen.getByText('/bigdata/explorer?mode=operations&type=session&status=completed&robot=all&range=7')).toBeInTheDocument();
  });

  it.each(['all', 'paused', 'cancelled'])('미분류 상태 %s의 원문 식별자를 drilldown query에 보존한다', async (rawStatus) => {
    const user = userEvent.setup();
    const statusAnalytics: AnalyticsPort = {
      ...analytics,
      getOverview: () => Promise.resolve({
        sessionCount: 1,
        successRatePercent: 0,
        bytesWritten: 0,
        episodeCount: 0,
        datasetCount: 0,
        statusSeries: [{ label: rawStatus, value: 1 }],
        trendSeries: [],
      }),
    };
    render(<ClockContext.Provider value={clock}><AnalyticsContext.Provider value={statusAnalytics}><RobotCatalogContext.Provider value={createInMemoryRobotCatalogWithData()}><MemoryRouter initialEntries={['/bigdata/overview']}><Routes><Route element={<BigDataOverviewPage />} path="/bigdata/overview" /><Route element={<LocationProbe />} path="/bigdata/explorer" /></Routes></MemoryRouter></RobotCatalogContext.Provider></AnalyticsContext.Provider></ClockContext.Provider>);

    await user.click(await screen.findByRole('button', {
      name: `미분류 상태 (${rawStatus}) 상세`,
    }));
    expect(screen.getByText(`/bigdata/explorer?mode=operations&type=session&status=${rawStatus}&range=7`)).toBeInTheDocument();
  });
});
