import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  RobotCatalogContext,
  type RobotCatalogPort,
  type RobotDescriptor,
} from '@/entities/robot';
import {
  RobotEventRepositoryContext,
  type RobotEvent,
  type RobotEventRepositoryPort,
} from '@/entities/robot-event';
import { ClockContext, type ClockPort } from '@/shared/lib/clock';

import { EventsPage } from './EventsPage';

const dayMs = 86_400_000;
const initialNowMs = Date.parse('2026-08-21T00:00:00Z');

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

function LocationSearchProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

const robot: RobotDescriptor = {
  id: 'robot-001',
  serialNumber: 'MOCK00001',
  name: '정찰 로봇 01',
  displayName: '정찰 로봇 01',
  integrationProfileId: 'robot-profile-v1',
};

const event: RobotEvent = {
  id: 'event-001',
  robotId: robot.id,
  type: 'warning',
  occurredAtMs: initialNowMs - 1_000,
  title: '위치 데이터 지연',
  detail: '최근 위치 데이터의 수신 간격이 늘었습니다.',
};

function makeRobotCatalog(
  listRobots: RobotCatalogPort['listRobots'] = () => Promise.resolve([robot]),
): RobotCatalogPort {
  return {
    listRobots,
    queryRobots: (query) => Promise.resolve({
      items: [robot],
      page: query.page,
      pageSize: query.pageSize,
      totalItems: 1,
      totalPages: 1,
    }),
    getRobot: (robotId) => Promise.resolve(robotId === robot.id ? robot : null),
  };
}

function makeRepository(
  overrides: Partial<RobotEventRepositoryPort> = {},
): RobotEventRepositoryPort {
  return {
    listEvents: () => Promise.resolve([]),
    queryEvents: (query) => Promise.resolve({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      totalItems: 0,
      totalPages: 1,
    }),
    subscribe: () => () => undefined,
    ...overrides,
  };
}

function renderPage(
  repository: RobotEventRepositoryPort,
  initialEntry = '/control/events',
  catalog: RobotCatalogPort = makeRobotCatalog(),
  clock: ClockPort = { nowMs: () => initialNowMs },
) {
  return render(
    <ClockContext.Provider value={clock}>
      <RobotCatalogContext.Provider value={catalog}>
        <RobotEventRepositoryContext.Provider value={repository}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <LocationSearchProbe />
            <EventsPage />
          </MemoryRouter>
        </RobotEventRepositoryContext.Provider>
      </RobotCatalogContext.Provider>
    </ClockContext.Provider>,
  );
}

describe('EventsPage', () => {
  it('갱신 결과에서 행이 사라져도 상세 dialog를 유지하고 결과 영역으로 복귀한다', async () => {
    const user = userEvent.setup();
    let invalidate: (() => void) | undefined;
    let resolveRefresh: (
      result: Awaited<ReturnType<RobotEventRepositoryPort['queryEvents']>>,
    ) => void = () => undefined;
    const pendingRefresh = new Promise<
      Awaited<ReturnType<RobotEventRepositoryPort['queryEvents']>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    const readyResult = {
      items: [event],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    };
    const queryEvents = vi
      .fn<RobotEventRepositoryPort['queryEvents']>()
      .mockResolvedValueOnce(readyResult)
      .mockImplementationOnce(() => pendingRefresh);
    renderPage(makeRepository({
      queryEvents,
      subscribe: (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    }));

    await user.click(await screen.findByRole('button', {
      name: `${event.title} 상세 보기 (${event.id})`,
    }));
    const dialog = await screen.findByRole('dialog', { name: event.title });
    const closeButton = screen.getByRole('button', { name: '닫기' });
    closeButton.focus();
    await waitFor(() => expect(invalidate).toBeDefined());

    act(() => invalidate?.());

    expect(await screen.findByRole(
      'status',
      { hidden: true, name: '불러오는 중' },
    )).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('table', {
      hidden: true,
      name: '로봇 이벤트 목록',
    })).toBeInTheDocument();
    expect(closeButton).toHaveFocus();

    await act(async () => {
      resolveRefresh({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 1,
      });
      await pendingRefresh;
    });

    expect(dialog).toBeInTheDocument();
    expect(closeButton).toHaveFocus();
    await user.click(closeButton);
    expect(screen.getByRole('region', { name: '이벤트 결과 영역' })).toHaveFocus();
  });

  it('URL에 기간이 없으면 기본 7일 범위로 조회한다', async () => {
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(makeRepository({ queryEvents }));

    await waitFor(() => expect(queryEvents).toHaveBeenCalledOnce());
    expect(queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startMs: initialNowMs - 7 * dayMs }),
    );
  });

  it('이벤트 유형을 URL과 조회 조건에 반영한다', async () => {
    const user = userEvent.setup();
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [event],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    renderPage(makeRepository({ queryEvents }));

    await screen.findByText(event.title);
    queryEvents.mockClear();
    screen.getByRole('combobox', { name: '유형' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', { name: '오류' });
    await user.keyboard('{End}{Enter}');

    await waitFor(() => expect(queryEvents).toHaveBeenCalledOnce());
    expect(queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent('?type=error');
  });

  it('전체 기간을 URL에 보존하고 시작 시각 제한 없이 조회한다', async () => {
    const user = userEvent.setup();
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [event],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    renderPage(makeRepository({ queryEvents }));

    await screen.findByText(event.title);
    queryEvents.mockClear();
    screen.getByRole('combobox', { name: '기간' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', { name: '전체' });
    await user.keyboard('{End}{Enter}');

    await waitFor(() => expect(queryEvents).toHaveBeenCalledOnce());
    expect(queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startMs: null }),
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent('?range=all');
    expect(screen.getByRole('combobox', { name: '기간' })).toHaveTextContent('전체');
  });

  it('외부 로봇 ID all을 전체 선택과 구분해 URL과 조회에 보존한다', async () => {
    const user = userEvent.setup();
    const allIdRobot: RobotDescriptor = {
      ...robot,
      id: 'all',
      displayName: '외부 ID all 로봇',
    };
    const allIdEvent: RobotEvent = {
      ...event,
      id: 'event-all',
      robotId: allIdRobot.id,
      title: 'all ID 로봇 이벤트',
    };
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [allIdEvent],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    const repository = makeRepository({ queryEvents });
    const catalog = makeRobotCatalog(() => Promise.resolve([robot, allIdRobot]));
    const firstRender = renderPage(repository, '/control/events', catalog);

    await screen.findByText(allIdEvent.title);
    queryEvents.mockClear();
    screen.getByRole('combobox', { name: '로봇' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', { name: allIdRobot.displayName });
    await user.keyboard('{End}{Enter}');

    await waitFor(() => expect(queryEvents).toHaveBeenCalledOnce());
    expect(queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: allIdRobot.id }),
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent('?robotId=all');
    expect(screen.getByRole('combobox', { name: '로봇' })).toHaveTextContent(
      allIdRobot.displayName,
    );

    firstRender.unmount();
    queryEvents.mockClear();
    renderPage(repository, '/control/events?robotId=all', catalog);

    await waitFor(() => expect(queryEvents).toHaveBeenCalledOnce());
    expect(queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: allIdRobot.id }),
    );
    expect(screen.getByRole('combobox', { name: '로봇' })).toHaveTextContent(
      allIdRobot.displayName,
    );
  });

  it('제목이 같은 이벤트의 상세 버튼을 이벤트 ID로 구분한다', async () => {
    const repeatedTitleEvent: RobotEvent = {
      ...event,
      id: 'event-002',
      detail: '같은 제목으로 기록된 두 번째 이벤트입니다.',
    };
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [event, repeatedTitleEvent],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 2,
        totalPages: 1,
      }));
    renderPage(makeRepository({ queryEvents }));

    expect(
      await screen.findByRole('button', {
        name: `${event.title} 상세 보기 (${event.id})`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `${repeatedTitleEvent.title} 상세 보기 (${repeatedTitleEvent.id})`,
      }),
    ).toBeInTheDocument();
  });

  it('등록되지 않은 명시적 로봇은 조회하지 않고 전체 필터 복구를 제공한다', async () => {
    const user = userEvent.setup();
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(
      makeRepository({ queryEvents }),
      '/control/events?robotId=missing-robot',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('missing-robot');
    expect(queryEvents).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '전체 로봇 보기' }));

    await waitFor(() => expect(queryEvents).toHaveBeenCalledOnce());
    expect(queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: null }),
    );
  });

  it('명시적 로봇 필터는 로봇 목록이 결정되기 전 조회하지 않는다', async () => {
    let resolveCatalog: ((robots: readonly RobotDescriptor[]) => void) | undefined;
    const listRobots = vi.fn<RobotCatalogPort['listRobots']>(() =>
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }));
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(
      makeRepository({ queryEvents }),
      '/control/events?robotId=robot-001',
      makeRobotCatalog(listRobots),
    );

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(queryEvents).not.toHaveBeenCalled();

    await act(async () => {
      resolveCatalog?.([robot]);
      await Promise.resolve();
    });

    await waitFor(() => expect(queryEvents).toHaveBeenCalledOnce());
  });

  it('필터 없는 조회는 로봇 목록 실패와 격리해 이벤트 결과를 유지한다', async () => {
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [event],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    renderPage(
      makeRepository({ queryEvents }),
      '/control/events',
      makeRobotCatalog(() => Promise.reject(new Error('로봇 목록 실패'))),
    );

    expect(await screen.findByText(event.title)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('로봇 목록을 불러오지 못했습니다.');
    expect(screen.getByRole('combobox', { name: '로봇' })).toBeDisabled();
    expect(queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: null }),
    );
  });

  it('변경 알림 재조회에서 이동 기간 기준 시각을 새로 읽는다', async () => {
    let nowMs = initialNowMs;
    let listener: (() => void) | undefined;
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(
      makeRepository({
        queryEvents,
        subscribe: (nextListener) => {
          listener = nextListener;
          return () => undefined;
        },
      }),
      '/control/events?range=1',
      makeRobotCatalog(),
      { nowMs: () => nowMs },
    );
    await waitFor(() => expect(queryEvents).toHaveBeenCalledOnce());
    await waitFor(() => expect(listener).toBeDefined());

    nowMs += 3_600_000;
    act(() => listener?.());

    await waitFor(() => expect(queryEvents).toHaveBeenCalledTimes(2));
    expect(queryEvents.mock.calls[1]?.[0]).toMatchObject({
      startMs: nowMs - dayMs,
    });
  });

  it('페이지 이동에는 같은 이동 기간 기준 시각을 유지한다', async () => {
    const user = userEvent.setup();
    let nowMs = initialNowMs;
    const events = Array.from({ length: 21 }, (_, index) => ({
      ...event,
      id: `event-${String(index + 1)}`,
      title: `이벤트 ${String(index + 1)}`,
      occurredAtMs: initialNowMs - index,
    }));
    const queryEvents = vi.fn<RobotEventRepositoryPort['queryEvents']>((query) =>
      Promise.resolve({
        items: query.page === 1 ? events.slice(0, 20) : events.slice(20),
        page: query.page,
        pageSize: query.pageSize,
        totalItems: events.length,
        totalPages: 2,
      }));
    renderPage(
      makeRepository({ queryEvents }),
      '/control/events?range=1',
      makeRobotCatalog(),
      { nowMs: () => nowMs },
    );
    await screen.findByText('이벤트 1');
    const firstStartMs = queryEvents.mock.calls[0]?.[0].startMs;

    nowMs += 3_600_000;
    await user.click(screen.getByRole('button', { name: '다음' }));

    await screen.findByText('이벤트 21');
    expect(queryEvents.mock.calls.at(-1)?.[0]).toMatchObject({
      page: 2,
      startMs: firstStartMs,
    });
  });
});
