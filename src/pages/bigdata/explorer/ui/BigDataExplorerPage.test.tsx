import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AnalyticsContext,
  type AnalyticsPort,
  type AnalyticsRecord,
} from '@/entities/analytics';
import {
  createInMemoryRobotCatalogWithData,
  RobotCatalogContext,
  type RobotCatalogPort,
  type RobotDescriptor,
} from '@/entities/robot';
import { ClockContext, type ClockPort } from '@/shared/lib/clock';

import { parseLocalDateEnd, parseLocalDateStart } from '../model/local-date-range';
import { BigDataExplorerPage } from './BigDataExplorerPage';

vi.mock('@/shared/ui/chart', () => ({
  Chart: ({ accessibleSummary }: { readonly accessibleSummary: ReactNode }) => (
    <div>{accessibleSummary}</div>
  ),
}));

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterAll(() => {
  if (scrollIntoViewDescriptor === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    return;
  }
  Object.defineProperty(
    HTMLElement.prototype,
    'scrollIntoView',
    scrollIntoViewDescriptor,
  );
});

const nowMs = Date.parse('2026-08-21T09:00:00+09:00');
const clock: ClockPort = { nowMs: () => nowMs };
const emptyRobotCatalog: RobotCatalogPort = {
  listRobots: () => Promise.resolve([]),
  queryRobots: (query) => Promise.resolve({
    items: [],
    page: query.page,
    pageSize: query.pageSize,
    totalItems: 0,
    totalPages: 1,
  }),
  getRobot: () => Promise.resolve(null),
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

const collisionRobotCatalog = createRobotCatalog([
  {
    id: 'all',
    serialNumber: 'ALL001',
    displayName: 'ALL 실기체',
    description: null,
    integrationProfileId: 'profile-all',
  },
  {
    id: 'robot-002',
    serialNumber: 'MOCK00002',
    displayName: '두 번째 로봇',
    description: null,
    integrationProfileId: 'profile-002',
  },
]);

interface AnalyticsHarness {
  readonly port: AnalyticsPort;
  readonly queryOperations: ReturnType<typeof vi.fn<AnalyticsPort['queryOperations']>>;
  readonly queryTelemetry: ReturnType<typeof vi.fn<AnalyticsPort['queryTelemetry']>>;
  readonly subscribe: ReturnType<typeof vi.fn<AnalyticsPort['subscribe']>>;
  readonly invalidate: () => void;
}

function createAnalytics(
  records: readonly AnalyticsRecord[] = [],
): AnalyticsHarness {
  const queryOperations = vi.fn<AnalyticsPort['queryOperations']>(
    () => Promise.resolve({ records, groups: [] }),
  );
  const queryTelemetry = vi.fn<AnalyticsPort['queryTelemetry']>(
    () => Promise.resolve({
      bucketMs: 10_000,
      displayedPointCount: 1,
      points: [{
        timestampMs: nowMs,
        average: 1,
        minimum: 0.5,
        maximum: 1.5,
        sampleCount: 10,
      }],
    }),
  );
  const listeners = new Set<() => void>();
  const subscribe = vi.fn<AnalyticsPort['subscribe']>((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
  const port: AnalyticsPort = {
    getOverview: vi.fn(() => Promise.reject(new Error('사용하지 않는 조회'))),
    queryOperations,
    queryTelemetry,
    subscribe,
  };
  return {
    port,
    queryOperations,
    queryTelemetry,
    subscribe,
    invalidate: () => [...listeners].forEach((listener) => listener()),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function TelemetryChannelNavigation() {
  const [params, setParams] = useSearchParams();
  return (
    <button
      onClick={() => {
        const next = new URLSearchParams(params);
        next.set('channel', 'battery');
        setParams(next);
      }}
      type="button"
    >
      테스트 채널 변경
    </button>
  );
}

function OperationFilterNavigation() {
  const [params, setParams] = useSearchParams();
  return (
    <button
      onClick={() => {
        const next = new URLSearchParams(params);
        next.set('type', 'episode');
        next.set('group', 'status');
        setParams(next);
      }}
      type="button"
    >
      테스트 운영 필터 변경
    </button>
  );
}

type TestNavigation = 'operation-filter' | 'telemetry-channel';

function renderPage(
  analytics: AnalyticsPort,
  initialEntry: string,
  robots: RobotCatalogPort = createInMemoryRobotCatalogWithData(),
  testNavigation: TestNavigation | null = null,
) {
  return render(
    <ClockContext.Provider value={clock}>
      <AnalyticsContext.Provider value={analytics}>
        <RobotCatalogContext.Provider value={robots}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <LocationProbe />
            {testNavigation === 'telemetry-channel' ? <TelemetryChannelNavigation /> : null}
            {testNavigation === 'operation-filter' ? <OperationFilterNavigation /> : null}
            <BigDataExplorerPage />
          </MemoryRouter>
        </RobotCatalogContext.Provider>
      </AnalyticsContext.Provider>
    </ClockContext.Provider>,
  );
}

describe('BigDataExplorerPage', () => {
  it('운영 기록 탭에서 비활성 Telemetry를 조회하지 않고 24시간 이동 범위를 유지한다', async () => {
    const analytics = createAnalytics();
    renderPage(analytics.port, '/bigdata/explorer?mode=operations&range=1');

    expect(
      await screen.findByText(/조건에 맞는 운영 기록이 없습니다/),
    ).toBeInTheDocument();
    expect(analytics.queryTelemetry).not.toHaveBeenCalled();
    expect(analytics.queryOperations).toHaveBeenCalledOnce();
    expect(analytics.queryOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        startMs: nowMs - 86_400_000,
        endMs: nowMs,
      }),
    );
  });

  it('Robot 목록 실패가 필터 없는 운영 기록 조회와 결과 UI를 막지 않는다', async () => {
    const record: AnalyticsRecord = {
      id: 'session-1',
      type: 'session',
      name: '부분 실패 수집',
      status: 'completed',
      robotId: null,
      timestampMs: nowMs,
      bytes: null,
      provenance: null,
    };
    const analytics = createAnalytics([record]);
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&range=7',
      failedRobotCatalog,
    );

    expect(await screen.findByText('부분 실패 수집')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '전체 로봇 기준 운영 기록은 유지했습니다',
    );
    expect(screen.getByRole('combobox', { name: '로봇' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '로봇 목록 다시 불러오기' }),
    ).toBeEnabled();
    expect(analytics.queryOperations).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: null }),
    );
    expect(analytics.queryTelemetry).not.toHaveBeenCalled();
  });

  it.each([
    ['operations', '/bigdata/explorer?mode=operations&robot=all', 'queryOperations'],
    ['telemetry', '/bigdata/explorer?mode=telemetry&robotId=all', 'queryTelemetry'],
  ] as const)('실제 Robot ID all을 %s 전체 sentinel과 구분해 조회·URL에 보존한다', async (mode, entry, queryName) => {
    const user = userEvent.setup();
    const analytics = createAnalytics();
    renderPage(analytics.port, entry, collisionRobotCatalog);

    if (mode === 'operations') {
      await screen.findByText(/조건에 맞는 운영 기록이 없습니다/);
    } else {
      await screen.findByRole('table', { name: '텔레메트리 집계점 목록' });
    }
    expect(analytics[queryName]).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: 'all' }),
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent(
      mode === 'operations' ? 'robot=all' : 'robotId=all',
    );
    const robotSelect = screen.getByRole('combobox', { name: '로봇' });
    expect(robotSelect).toHaveTextContent('ALL 실기체');
    robotSelect.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option', { name: 'ALL 실기체' })).toHaveLength(1);
    if (mode === 'operations') {
      expect(screen.getAllByRole('option', { name: '전체' })).toHaveLength(1);
    }
  });

  it('명시적 운영 Robot 필터는 목록 검증 실패 시 AnalyticsPort로 전달하지 않는다', async () => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&robot=robot-001',
      failedRobotCatalog,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('로봇 목록을 불러오지 못했습니다.');
    expect(analytics.queryOperations).not.toHaveBeenCalled();
    expect(analytics.queryTelemetry).not.toHaveBeenCalled();
    expect(analytics.subscribe).not.toHaveBeenCalled();
  });

  it('등록 Robot이 없으면 빈 ID의 합성 Telemetry를 조회하지 않는다', async () => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=telemetry&range=7',
      emptyRobotCatalog,
    );

    expect(
      await screen.findByText(/등록된 로봇이 없어 텔레메트리 집계를 조회할 수 없습니다/),
    ).toBeInTheDocument();
    expect(analytics.queryTelemetry).not.toHaveBeenCalled();
    expect(analytics.queryOperations).not.toHaveBeenCalled();
  });

  it('Telemetry 기본 Robot을 replace URL에 기록한 뒤 결정적으로 조회한다', async () => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=telemetry&range=7',
      collisionRobotCatalog,
    );

    await screen.findByRole('table', { name: '텔레메트리 집계점 목록' });
    expect(screen.getByTestId('location-search')).toHaveTextContent(
      'robotId=all',
    );
    expect(analytics.queryTelemetry).toHaveBeenCalledOnce();
    expect(analytics.queryTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: 'all' }),
    );
  });

  it('날짜 query를 사용자 지정 기간으로 취급하고 달력 시작일과 종료일을 전달한다', async () => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&range=7&start=2026-08-19&end=2026-08-20',
    );

    await screen.findByText(/조건에 맞는 운영 기록이 없습니다/);
    expect(screen.getByText('사용자 지정')).toBeInTheDocument();
    expect(analytics.queryOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        startMs: parseLocalDateStart('2026-08-19'),
        endMs: parseLocalDateEnd('2026-08-20'),
      }),
    );
  });

  it('잘못된 사용자 지정 날짜에서는 조회를 실행하지 않는다', async () => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&range=custom&start=2026-02-30&end=2026-03-01',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('올바른 날짜로 모두 입력');
    expect(analytics.queryOperations).not.toHaveBeenCalled();
    expect(analytics.queryTelemetry).not.toHaveBeenCalled();
  });

  it('시작일이 종료일보다 늦은 사용자 지정 기간에서는 조회와 구독을 실행하지 않는다', async () => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&range=custom&start=2026-08-21&end=2026-08-20',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '시작일은 종료일보다 늦을 수 없습니다',
    );
    expect(analytics.queryOperations).not.toHaveBeenCalled();
    expect(analytics.queryTelemetry).not.toHaveBeenCalled();
    expect(analytics.subscribe).not.toHaveBeenCalled();
  });

  it('열거형 URL 필터는 정규화하고 명시적 상태 원문은 좁은 조회로 유지한다', async () => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&type=unknown&status=unknown&group=unknown&environment=unknown&deliveryMode=unknown&range=unknown&page=-2',
    );

    await screen.findByText(/조건에 맞는 운영 기록이 없습니다/);
    expect(analytics.queryOperations).toHaveBeenCalledWith({
      startMs: nowMs - 7 * 86_400_000,
      endMs: nowMs,
      robotId: null,
      type: 'session',
      status: 'unknown',
      environment: null,
      deliveryMode: null,
      groupBy: 'none',
    });
  });

  it.each(['all', 'paused', 'cancelled'])('명시적 미분류 상태 %s를 전체로 넓히지 않고 조회·URL에 보존한다', async (rawStatus) => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      `/bigdata/explorer?mode=operations&type=session&status=${rawStatus}`,
    );

    await screen.findByText(/조건에 맞는 운영 기록이 없습니다/);
    expect(analytics.queryOperations).toHaveBeenCalledWith(
      expect.objectContaining({ status: rawStatus }),
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent(`status=${rawStatus}`);
    expect(screen.getByRole('combobox', { name: '상태' })).toHaveTextContent(
      `미분류 상태 (${rawStatus})`,
    );
  });

  it.each([
    ['/bigdata/explorer?mode=operations&robot=missing-robot', 'queryOperations'],
    ['/bigdata/explorer?mode=telemetry&robotId=missing-robot', 'queryTelemetry'],
  ] as const)('등록되지 않은 명시적 Robot ID %s를 다른 대상으로 확대하지 않는다', async (entry, queryName) => {
    const analytics = createAnalytics();
    renderPage(analytics.port, entry);

    expect(await screen.findByRole('alert')).toHaveTextContent('missing-robot');
    expect(analytics[queryName]).not.toHaveBeenCalled();
  });

  it('탭 전환 뒤 현재 탭의 조회만 실행한다', async () => {
    const user = userEvent.setup();
    const analytics = createAnalytics();
    renderPage(analytics.port, '/bigdata/explorer?mode=operations&range=7');

    await screen.findByText(/조건에 맞는 운영 기록이 없습니다/);
    await user.click(screen.getByRole('tab', { name: '텔레메트리 집계' }));

    await waitFor(() => expect(analytics.queryTelemetry).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole('table', { name: '텔레메트리 집계점 목록' }),
    ).toBeInTheDocument();
    expect(analytics.queryOperations).toHaveBeenCalledOnce();
  });

  it('Analytics 변경 알림에서 현재 운영·Telemetry 모드만 다시 조회한다', async () => {
    const user = userEvent.setup();
    const analytics = createAnalytics();
    renderPage(analytics.port, '/bigdata/explorer?mode=operations&range=7');

    await screen.findByText(/조건에 맞는 운영 기록이 없습니다/);
    expect(analytics.subscribe).toHaveBeenCalledOnce();
    act(() => analytics.invalidate());
    await waitFor(() => expect(analytics.queryOperations).toHaveBeenCalledTimes(2));
    expect(analytics.queryTelemetry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: '텔레메트리 집계' }));
    await waitFor(() => expect(analytics.queryTelemetry).toHaveBeenCalledOnce());
    await waitFor(() => expect(analytics.subscribe).toHaveBeenCalledTimes(2));
    act(() => analytics.invalidate());
    await waitFor(() => expect(analytics.queryTelemetry).toHaveBeenCalledTimes(2));
    expect(analytics.queryOperations).toHaveBeenCalledTimes(2);
  });

  it('운영 기록 갱신 중에도 표와 페이지 포커스를 유지한다', async () => {
    const records: readonly AnalyticsRecord[] = Array.from(
      { length: 21 },
      (_, index) => ({
        id: `session-refresh-${String(index + 1)}`,
        type: 'session',
        name: `갱신 포커스 수집 ${String(index + 1)}`,
        status: 'completed',
        robotId: 'robot-001',
        timestampMs: nowMs - index,
        bytes: index,
        provenance: null,
      }),
    );
    const analytics = createAnalytics(records);
    let resolveRefresh: (
      value: Awaited<ReturnType<AnalyticsPort['queryOperations']>>,
    ) => void = () => undefined;
    const pendingRefresh = new Promise<
      Awaited<ReturnType<AnalyticsPort['queryOperations']>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    const readyResult = { records, groups: [] };
    analytics.queryOperations
      .mockResolvedValueOnce(readyResult)
      .mockImplementationOnce(() => pendingRefresh);
    renderPage(analytics.port, '/bigdata/explorer?mode=operations&range=7');

    await screen.findByText('갱신 포커스 수집 1');
    await waitFor(() => expect(analytics.subscribe).toHaveBeenCalledOnce());
    const nextPage = screen.getByRole('button', { name: '다음' });
    nextPage.focus();

    act(() => analytics.invalidate());

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '운영 기록 목록' })).toBeInTheDocument();
    expect(nextPage).toHaveFocus();
    expect(nextPage).toHaveAttribute('aria-disabled', 'true');

    await act(async () => {
      resolveRefresh(readyResult);
      await pendingRefresh;
    });
  });

  it('Telemetry 갱신 중에도 chart·table과 표 영역 포커스를 유지한다', async () => {
    const analytics = createAnalytics();
    const readyResult = {
      bucketMs: 10_000,
      displayedPointCount: 1,
      points: [{
        timestampMs: nowMs,
        average: 1,
        minimum: 0.5,
        maximum: 1.5,
        sampleCount: 10,
      }],
    };
    let resolveRefresh: (
      value: Awaited<ReturnType<AnalyticsPort['queryTelemetry']>>,
    ) => void = () => undefined;
    const pendingRefresh = new Promise<
      Awaited<ReturnType<AnalyticsPort['queryTelemetry']>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    analytics.queryTelemetry
      .mockResolvedValueOnce(readyResult)
      .mockImplementationOnce(() => pendingRefresh);
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=telemetry&robotId=robot-001&channel=pose&range=7',
    );

    const tableRegion = await screen.findByRole('region', {
      name: '텔레메트리 집계점 목록 가로 스크롤 영역',
    });
    await waitFor(() => expect(analytics.subscribe).toHaveBeenCalledOnce());
    tableRegion.focus();

    act(() => analytics.invalidate());

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '위치 채널 집계값 집계' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '텔레메트리 집계점 목록' })).toBeInTheDocument();
    expect(tableRegion).toHaveFocus();

    await act(async () => {
      resolveRefresh(readyResult);
      await pendingRefresh;
    });
  });

  it('mode 전환 조회 중에는 직전 mode 결과를 현재 탭에 표시하지 않는다', async () => {
    const user = userEvent.setup();
    const record: AnalyticsRecord = {
      id: 'session-mode-switch',
      type: 'session',
      name: '이전 운영 모드 기록',
      status: 'completed',
      robotId: 'robot-001',
      timestampMs: nowMs,
      bytes: 1,
      provenance: null,
    };
    const analytics = createAnalytics([record]);
    let resolveTelemetry: (
      value: Awaited<ReturnType<AnalyticsPort['queryTelemetry']>>,
    ) => void = () => undefined;
    const pendingTelemetry = new Promise<
      Awaited<ReturnType<AnalyticsPort['queryTelemetry']>>
    >((resolve) => {
      resolveTelemetry = resolve;
    });
    analytics.queryTelemetry.mockImplementationOnce(() => pendingTelemetry);
    renderPage(analytics.port, '/bigdata/explorer?mode=operations&range=7');

    expect(await screen.findByText(record.name)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '텔레메트리 집계' }));

    expect(await screen.findByRole(
      'status',
      { name: '불러오는 중' },
    )).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: '운영 기록 목록' })).not.toBeInTheDocument();
    expect(screen.queryByText(record.name)).not.toBeInTheDocument();

    await act(async () => {
      resolveTelemetry({
        bucketMs: 10_000,
        displayedPointCount: 1,
        points: [{
          timestampMs: nowMs,
          average: 1,
          minimum: 0.5,
          maximum: 1.5,
          sampleCount: 10,
        }],
      });
      await pendingTelemetry;
    });
    expect(await screen.findByRole('table', {
      name: '텔레메트리 집계점 목록',
    })).toBeInTheDocument();
  });

  it('열린 내보내기 메뉴도 결과 갱신 중에는 선택할 수 없다', async () => {
    const user = userEvent.setup();
    const record: AnalyticsRecord = {
      id: 'session-refresh',
      type: 'session',
      name: '갱신 경쟁 수집',
      status: 'completed',
      robotId: 'robot-001',
      timestampMs: nowMs,
      bytes: 100,
      provenance: null,
    };
    const analytics = createAnalytics([record]);
    let resolveRefresh: (
      value: Awaited<ReturnType<AnalyticsPort['queryOperations']>>,
    ) => void = () => undefined;
    const pendingRefresh = new Promise<
      Awaited<ReturnType<AnalyticsPort['queryOperations']>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    analytics.queryOperations
      .mockResolvedValueOnce({ records: [record], groups: [] })
      .mockImplementationOnce(() => pendingRefresh);
    renderPage(analytics.port, '/bigdata/explorer?mode=operations&range=7');

    expect(await screen.findByText('갱신 경쟁 수집')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {
      name: '데이터 탐색 결과 내보내기',
    }));
    const jsonItem = await screen.findByRole('menuitem', {
      name: 'JSON 내보내기',
    });
    jsonItem.focus();

    act(() => analytics.invalidate());

    await waitFor(() => {
      expect(jsonItem).toHaveAttribute('aria-disabled', 'true');
      expect(jsonItem).toHaveAttribute('data-disabled');
    });
    expect(jsonItem).toHaveFocus();
    const subscribeCallCount = analytics.subscribe.mock.calls.length;
    await user.click(jsonItem);
    expect(analytics.subscribe).toHaveBeenCalledTimes(subscribeCallCount);

    await act(async () => {
      resolveRefresh({ records: [record], groups: [] });
      await pendingRefresh;
    });
  });

  it('키보드 탭 전환 뒤 선택된 탭의 포커스를 유지한다', async () => {
    const user = userEvent.setup();
    const analytics = createAnalytics();
    renderPage(analytics.port, '/bigdata/explorer?mode=operations&range=7');
    const operationsTab = await screen.findByRole('tab', { name: '운영 기록' });
    operationsTab.focus();

    await user.keyboard('{ArrowRight}');

    const telemetryTab = screen.getByRole('tab', { name: '텔레메트리 집계' });
    await waitFor(() => {
      expect(telemetryTab).toHaveAttribute('aria-selected', 'true');
      expect(telemetryTab).toHaveFocus();
    });
  });

  it('운영 기록 표를 페이지로 제한하고 내보내기 전체 개수를 공개한다', async () => {
    const user = userEvent.setup();
    const records: readonly AnalyticsRecord[] = Array.from(
      { length: 21 },
      (_, index) => ({
        id: `session-${String(index + 1)}`,
        type: 'session',
        name: `검증 수집 ${String(index + 1)}`,
        status: 'completed',
        robotId: 'robot-001',
        timestampMs: nowMs - index,
        bytes: index === 20 ? null : index,
        provenance: null,
      }),
    );
    const analytics = createAnalytics(records);
    analytics.queryOperations.mockResolvedValue({
      records,
      groups: [{ key: 'completed', count: records.length, bytes: null }],
    });
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&group=status',
    );

    expect(await screen.findByText('검증 수집 20')).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: '운영 기록 그룹 요약' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: '운영 기록 목록' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('검증 수집 21')).not.toBeInTheDocument();
    expect(screen.getByText(/운영 기록 21건 전체를 내보내기에 반영하고, 표에는 현재 페이지 20건/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText('검증 수집 21')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('실제 Robot ID unassigned와 null 그룹을 서로 다른 행으로 표시한다', async () => {
    const record: AnalyticsRecord = {
      id: 'session-unassigned',
      type: 'session',
      name: '식별자 충돌 검증',
      status: 'completed',
      robotId: 'unassigned',
      timestampMs: nowMs,
      bytes: 10,
      provenance: null,
    };
    const analytics = createAnalytics([record]);
    analytics.queryOperations.mockResolvedValue({
      records: [record],
      groups: [
        { key: 'unassigned', count: 1, bytes: 10 },
        { key: null, count: 1, bytes: null },
      ],
    });
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&type=session&group=robot',
    );

    const groupTable = await screen.findByRole('table', {
      name: '운영 기록 그룹 요약',
    });
    expect(within(groupTable).getByText('unassigned')).toBeInTheDocument();
    expect(within(groupTable).getByText('로봇 미지정')).toBeInTheDocument();
  });

  it('기간 변경 시 운영 기록의 이전 페이지 query를 제거한다', async () => {
    const user = userEvent.setup();
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&range=custom&start=2026-08-21&end=2026-08-20&page=2',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '시작일은 종료일보다 늦을 수 없습니다',
    );
    await user.click(screen.getByRole('button', { name: '최근 7일로 재설정' }));

    await waitFor(() => expect(screen.getByTestId('location-search')).not.toHaveTextContent('page='));
    expect(await screen.findByText(/조건에 맞는 운영 기록이 없습니다/)).toBeInTheDocument();
    expect(analytics.queryOperations).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startMs: nowMs - 7 * 86_400_000,
        endMs: nowMs,
      }),
    );
  });

  it('운영 조건 갱신 실패 시 직전 성공한 기록 종류와 그룹 맥락만 표시한다', async () => {
    const user = userEvent.setup();
    const record: AnalyticsRecord = {
      id: 'session-1',
      type: 'session',
      name: '직전 성공 수집',
      status: 'completed',
      robotId: 'robot-001',
      timestampMs: nowMs,
      bytes: 100,
      provenance: null,
    };
    const analytics = createAnalytics([record]);
    analytics.queryOperations
      .mockResolvedValueOnce({ records: [record], groups: [] })
      .mockRejectedValueOnce(new Error('에피소드 조회 실패'));
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&type=session&group=none&range=7',
      createInMemoryRobotCatalogWithData(),
      'operation-filter',
    );

    expect(await screen.findByText('직전 성공 수집')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '테스트 운영 필터 변경' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '마지막으로 성공한 조건의 결과를 유지했습니다. 에피소드 조회 실패',
    );
    expect(screen.getByRole('combobox', { name: '기록 종류' })).toHaveTextContent('에피소드');
    expect(screen.getByRole('columnheader', { name: '수집 세션' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '에피소드' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '상태 그룹 요약' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '데이터 탐색 결과 내보내기' }),
    ).toBeDisabled();
    expect(analytics.queryOperations).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'episode', groupBy: 'status' }),
    );
  });

  it('Telemetry 조건 갱신 실패 시 직전 성공 조건의 맥락만 표시하고 내보내기를 막는다', async () => {
    const user = userEvent.setup();
    const analytics = createAnalytics();
    analytics.queryTelemetry
      .mockResolvedValueOnce({
        bucketMs: 10_000,
        displayedPointCount: 1,
        points: [{
          timestampMs: nowMs,
          average: 1,
          minimum: 0.5,
          maximum: 1.5,
          sampleCount: 10,
        }],
      })
      .mockRejectedValueOnce(new Error('배터리 집계 실패'));
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=telemetry&robotId=robot-001&channel=pose&range=7',
      createInMemoryRobotCatalogWithData(),
      'telemetry-channel',
    );

    expect(
      await screen.findByRole('heading', { name: '위치 채널 집계값 집계' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '데이터 탐색 결과 내보내기' }),
    ).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '테스트 채널 변경' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '마지막으로 성공한 조건의 결과를 유지했습니다. 배터리 집계 실패',
    );
    expect(screen.getByRole('combobox', { name: '채널' })).toHaveTextContent(
      '배터리 채널 집계값',
    );
    expect(
      screen.getByRole('heading', { name: '위치 채널 집계값 집계' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '배터리 채널 집계값 집계' })).not.toBeInTheDocument();
    expect(screen.getByText(/robot-001 위치 채널 집계값 집계 1개/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '데이터 탐색 결과 내보내기' }),
    ).toBeDisabled();
  });

  it('데이터셋에는 단일 출처 필터를 노출하거나 stale URL 조건을 적용하지 않는다', async () => {
    const analytics = createAnalytics();
    renderPage(
      analytics.port,
      '/bigdata/explorer?mode=operations&type=dataset&robot=robot-001&environment=physical&deliveryMode=live&group=robot',
    );

    expect(await screen.findByText(/데이터셋에는 단일 로봇·실행 환경·전달 방식이 없으므로/)).toBeInTheDocument();
    expect(screen.queryByLabelText('로봇')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('실행 환경')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('전달 방식')).not.toBeInTheDocument();
    expect(analytics.queryOperations).toHaveBeenCalledWith(expect.objectContaining({
      robotId: null,
      environment: null,
      deliveryMode: null,
      groupBy: 'none',
      type: 'dataset',
    }));
  });
});
