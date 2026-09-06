import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CaptureOperationsContext,
  type CaptureOperationsPort,
  type CaptureSession,
} from '@/entities/capture-session';
import {
  RobotCatalogContext,
  type RobotCatalogPort,
  type RobotDescriptor,
} from '@/entities/robot';
import { ClockContext, type ClockPort } from '@/shared/lib/clock';

import { SessionsPage } from './SessionsPage';

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

const allIdRobot: RobotDescriptor = {
  ...robot,
  id: 'all',
  displayName: 'all ID 로봇',
};

function makeSession(index = 1, robotId = robot.id): CaptureSession {
  return {
    id: `session-${String(index)}`,
    name: `수집 세션 ${String(index)}`,
    robotId,
    sensorDeviceId: 'sensor-rig-001',
    integrationProfileId: robot.integrationProfileId,
    provenance: {
      environment: 'physical',
      deliveryMode: 'live',
      controlMode: 'teleop',
      dataOrigin: 'captured',
    },
    status: 'completed',
    createdAtMs: initialNowMs - index,
    startedAtMs: initialNowMs - index,
    stoppedAtMs: initialNowMs - index,
    completedAtMs: initialNowMs - index,
    bytesWritten: index,
    streams: [],
    episodeId: null,
    lastError: null,
    preflight: null,
    statusHistory: [{ status: 'completed', occurredAtMs: initialNowMs - index }],
  };
}

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

function makeOperations(
  overrides: Partial<CaptureOperationsPort> = {},
): CaptureOperationsPort {
  return {
    listSessions: () => Promise.resolve([]),
    querySessions: (query) => Promise.resolve({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      totalItems: 0,
      totalPages: 1,
    }),
    getSession: () => Promise.resolve(null),
    getPlanOptions: () => Promise.reject(new Error('사용하지 않는 조회')),
    createSession: () => Promise.reject(new Error('사용하지 않는 명령')),
    validateSession: () => Promise.reject(new Error('사용하지 않는 명령')),
    startSession: () => Promise.reject(new Error('사용하지 않는 명령')),
    stopSession: () => Promise.reject(new Error('사용하지 않는 명령')),
    subscribeSession: () => () => undefined,
    subscribeSessions: () => () => undefined,
    ...overrides,
  };
}

function renderPage(
  operations: CaptureOperationsPort,
  initialEntry = '/mlops/sessions',
  catalog: RobotCatalogPort = makeRobotCatalog(),
  clock: ClockPort = { nowMs: () => initialNowMs },
) {
  return render(
    <ClockContext.Provider value={clock}>
      <RobotCatalogContext.Provider value={catalog}>
        <CaptureOperationsContext.Provider value={operations}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <LocationSearchProbe />
            <SessionsPage />
          </MemoryRouter>
        </CaptureOperationsContext.Provider>
      </RobotCatalogContext.Provider>
    </ClockContext.Provider>,
  );
}

function installDownloadSpies() {
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:test',
    });
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: () => undefined,
    });
  }
  return {
    anchorClick: vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined),
    createObjectUrl: vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:test'),
  };
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Blob 텍스트를 읽지 못했습니다.'));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Blob 텍스트를 읽지 못했습니다.'));
    });
    reader.readAsText(blob);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SessionsPage', () => {
  it('URL에 기간이 없으면 기본 30일 범위로 조회한다', async () => {
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(makeOperations({ querySessions }));

    await waitFor(() => expect(querySessions).toHaveBeenCalledOnce());
    expect(querySessions).toHaveBeenCalledWith(
      expect.objectContaining({ startMs: initialNowMs - 30 * dayMs }),
    );
  });

  it('전체 기간을 URL과 조회·내보내기에 보존하고 재마운트 후 복원한다', async () => {
    const user = userEvent.setup();
    const session = makeSession();
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: [session],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    const { anchorClick } = installDownloadSpies();
    const view = renderPage(makeOperations({ querySessions }));

    await screen.findByText(session.name);
    querySessions.mockClear();
    screen.getByRole('combobox', { name: '기간' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', { name: '전체' });
    await user.keyboard('{End}{Enter}');

    await waitFor(() => expect(querySessions).toHaveBeenCalledOnce());
    expect(querySessions).toHaveBeenCalledWith(
      expect.objectContaining({ startMs: null }),
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent('?range=all');

    querySessions.mockClear();
    await user.click(screen.getByRole('button', { name: '수집 세션 내보내기' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV 내보내기' }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    expect(querySessions).toHaveBeenCalled();
    expect(
      querySessions.mock.calls.every(([query]) => query.startMs === null),
    ).toBe(true);

    const preservedEntry = `/mlops/sessions${screen.getByTestId('location-search').textContent ?? ''}`;
    view.unmount();
    querySessions.mockClear();
    renderPage(makeOperations({ querySessions }), preservedEntry);

    await waitFor(() => expect(querySessions).toHaveBeenCalledOnce());
    expect(querySessions).toHaveBeenCalledWith(
      expect.objectContaining({ startMs: null }),
    );
    expect(screen.getByRole('combobox', { name: '기간' })).toHaveTextContent('전체');
  });

  it('all 검색 문자열을 URL과 수집 세션 조회에 보존한다', async () => {
    const user = userEvent.setup();
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(makeOperations({ querySessions }));
    await waitFor(() => expect(querySessions).toHaveBeenCalledOnce());
    querySessions.mockClear();

    const search = screen.getByRole('searchbox', { name: '수집 세션 검색' });
    await user.type(search, 'all');

    await waitFor(() => expect(querySessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'all' }),
    ));
    expect(search).toHaveValue('all');
    expect(screen.getByTestId('location-search')).toHaveTextContent('?search=all');
  });

  it('실제 all 로봇 ID를 전체와 구분해 URL·조회·내보내기에 보존한다', async () => {
    const user = userEvent.setup();
    const session = makeSession(1, allIdRobot.id);
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: [session],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    const { anchorClick } = installDownloadSpies();
    renderPage(
      makeOperations({ querySessions }),
      '/mlops/sessions?robotId=all&search=all',
      makeRobotCatalog(() => Promise.resolve([allIdRobot, robot])),
    );

    await screen.findByText(session.name);
    expect(querySessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ robotId: 'all', search: 'all' }),
    );
    expect(screen.getByRole('combobox', { name: '로봇' })).toHaveTextContent(
      allIdRobot.displayName,
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent('robotId=all');
    expect(screen.getByTestId('location-search')).toHaveTextContent('search=all');

    querySessions.mockClear();
    await user.click(screen.getByRole('button', { name: '수집 세션 내보내기' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV 내보내기' }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    expect(querySessions).toHaveBeenCalled();
    expect(querySessions.mock.calls.every(([query]) => query.robotId === 'all')).toBe(true);

    querySessions.mockClear();
    screen.getByRole('combobox', { name: '로봇' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', { name: '전체' });
    await user.keyboard('{Home}{Enter}');

    await waitFor(() => expect(querySessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ robotId: null, search: 'all' }),
    ));
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('robotId=');
    expect(screen.getByTestId('location-search')).toHaveTextContent('search=all');
  });

  it('등록되지 않은 명시적 로봇은 조회하지 않고 전체 필터 복구를 제공한다', async () => {
    const user = userEvent.setup();
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(
      makeOperations({ querySessions }),
      '/mlops/sessions?robotId=missing-robot',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('missing-robot');
    expect(querySessions).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '전체 로봇 보기' }));

    await waitFor(() => expect(querySessions).toHaveBeenCalledOnce());
    expect(querySessions).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: null }),
    );
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('robotId=');
  });

  it('명시적 로봇 필터는 로봇 목록이 결정되기 전 조회하지 않는다', async () => {
    let resolveCatalog: ((robots: readonly RobotDescriptor[]) => void) | undefined;
    const listRobots = vi.fn<RobotCatalogPort['listRobots']>(() =>
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }));
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(
      makeOperations({ querySessions }),
      '/mlops/sessions?robotId=robot-001',
      makeRobotCatalog(listRobots),
    );

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(querySessions).not.toHaveBeenCalled();

    await act(async () => {
      resolveCatalog?.([robot]);
      await Promise.resolve();
    });

    await waitFor(() => expect(querySessions).toHaveBeenCalledOnce());
  });

  it('필터 없는 조회는 로봇 목록 실패와 격리해 세션 결과를 유지한다', async () => {
    const session = makeSession();
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: [session],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    renderPage(
      makeOperations({ querySessions }),
      '/mlops/sessions',
      makeRobotCatalog(() => Promise.reject(new Error('로봇 목록 실패'))),
    );

    expect(await screen.findByText(session.name)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('로봇 목록을 불러오지 못했습니다.');
    expect(screen.getByRole('combobox', { name: '로봇' })).toBeDisabled();
    expect(querySessions).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: null }),
    );
  });

  it('변경 알림 재조회에서 이동 기간 기준 시각을 새로 읽는다', async () => {
    let nowMs = initialNowMs;
    let listener: (() => void) | undefined;
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(
      makeOperations({
        querySessions,
        subscribeSessions: (nextListener) => {
          listener = nextListener;
          return () => undefined;
        },
      }),
      '/mlops/sessions?range=1',
      makeRobotCatalog(),
      { nowMs: () => nowMs },
    );
    await waitFor(() => expect(querySessions).toHaveBeenCalledOnce());
    await waitFor(() => expect(listener).toBeDefined());

    nowMs += 3_600_000;
    act(() => listener?.());

    await waitFor(() => expect(querySessions).toHaveBeenCalledTimes(2));
    expect(querySessions.mock.calls[1]?.[0]).toMatchObject({
      startMs: nowMs - dayMs,
    });
  });

  it('페이지 이동에는 같은 이동 기간 기준 시각을 유지한다', async () => {
    const user = userEvent.setup();
    let nowMs = initialNowMs;
    const sessions = Array.from({ length: 21 }, (_, index) => makeSession(index + 1));
    let resolveNextPage: (
      result: Awaited<ReturnType<CaptureOperationsPort['querySessions']>>,
    ) => void = () => undefined;
    const pendingNextPage = new Promise<
      Awaited<ReturnType<CaptureOperationsPort['querySessions']>>
    >((resolve) => {
      resolveNextPage = resolve;
    });
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) => {
      const result = {
        items: query.page === 1 ? sessions.slice(0, 20) : sessions.slice(20),
        page: query.page,
        pageSize: query.pageSize,
        totalItems: sessions.length,
        totalPages: 2,
      };
      return query.page === 1 ? Promise.resolve(result) : pendingNextPage;
    });
    renderPage(
      makeOperations({ querySessions }),
      '/mlops/sessions?range=1',
      makeRobotCatalog(),
      { nowMs: () => nowMs },
    );
    await screen.findByText('수집 세션 1');
    const firstStartMs = querySessions.mock.calls[0]?.[0].startMs;

    nowMs += 3_600_000;
    const nextPage = screen.getByRole('button', { name: '다음' });
    await user.click(nextPage);

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '수집 세션 목록' })).toBeInTheDocument();
    expect(nextPage).toHaveFocus();
    expect(nextPage).toHaveAttribute('aria-disabled', 'true');

    await act(async () => {
      resolveNextPage({
        items: sessions.slice(20),
        page: 2,
        pageSize: 20,
        totalItems: sessions.length,
        totalPages: 2,
      });
      await pendingNextPage;
    });

    await screen.findByText('수집 세션 21');
    expect(querySessions.mock.calls.at(-1)?.[0]).toMatchObject({
      page: 2,
      startMs: firstStartMs,
    });
  });

  it('내보내기에서 모든 페이지를 순회한 뒤 한 번만 파일을 만든다', async () => {
    const user = userEvent.setup();
    const sessions = Array.from({ length: 21 }, (_, index) => makeSession(index + 1));
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) =>
      Promise.resolve({
        items: query.page === 1 ? sessions.slice(0, 20) : sessions.slice(20),
        page: query.page,
        pageSize: query.pageSize,
        totalItems: sessions.length,
        totalPages: 2,
      }));
    const { anchorClick, createObjectUrl } = installDownloadSpies();
    renderPage(makeOperations({ querySessions }));

    await screen.findByText('수집 세션 1');
    await user.click(screen.getByRole('button', { name: '수집 세션 내보내기' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV 내보내기' }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(querySessions).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    const exportedBlob = createObjectUrl.mock.calls[0]?.[0];
    expect(exportedBlob).toBeInstanceOf(Blob);
    if (!(exportedBlob instanceof Blob)) {
      throw new Error('내보낸 Blob을 확인할 수 없습니다.');
    }
    expect(await readBlob(exportedBlob)).toContain(
      '"environment","deliveryMode","controlMode","dataOrigin"',
    );
  });

  it('내보내기 중간 페이지가 실패하면 부분 파일을 다운로드하지 않는다', async () => {
    const user = userEvent.setup();
    const sessions = Array.from({ length: 20 }, (_, index) => makeSession(index + 1));
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) => {
      if (query.page === 2) return Promise.reject(new Error('두 번째 페이지 실패'));
      return Promise.resolve({
        items: sessions,
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 21,
        totalPages: 2,
      });
    });
    const { anchorClick, createObjectUrl } = installDownloadSpies();
    renderPage(makeOperations({ querySessions }));

    await screen.findByText('수집 세션 1');
    await user.click(screen.getByRole('button', { name: '수집 세션 내보내기' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV 내보내기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '내보내기에 실패했습니다. 두 번째 페이지 실패',
    );
    expect(querySessions).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it('내보내기 도중 URL 조회 조건이 바뀌면 이전 조건의 파일을 다운로드하지 않는다', async () => {
    const user = userEvent.setup();
    const sessions = Array.from({ length: 21 }, (_, index) => makeSession(index + 1));
    let resolveSecondPage: (
      result: Awaited<ReturnType<CaptureOperationsPort['querySessions']>>,
    ) => void = () => undefined;
    const pendingSecondPage = new Promise<
      Awaited<ReturnType<CaptureOperationsPort['querySessions']>>
    >((resolve) => {
      resolveSecondPage = resolve;
    });
    const querySessions = vi.fn<CaptureOperationsPort['querySessions']>((query) => {
      if (query.page === 2) return pendingSecondPage;
      return Promise.resolve({
        items: sessions.slice(0, 20),
        page: query.page,
        pageSize: query.pageSize,
        totalItems: sessions.length,
        totalPages: 2,
      });
    });
    const { anchorClick, createObjectUrl } = installDownloadSpies();
    renderPage(makeOperations({ querySessions }));

    await screen.findByText('수집 세션 1');
    await user.click(screen.getByRole('button', { name: '수집 세션 내보내기' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV 내보내기' }));
    await waitFor(() => expect(querySessions).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    ));

    await user.type(
      screen.getByRole('searchbox', { name: '수집 세션 검색' }),
      '새 조건',
    );
    await act(async () => {
      resolveSecondPage({
        items: sessions.slice(20),
        page: 2,
        pageSize: 20,
        totalItems: sessions.length,
        totalPages: 2,
      });
      await pendingSecondPage;
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '내보내는 동안 결과 집합이 변경되었습니다',
    );
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
  });
});
