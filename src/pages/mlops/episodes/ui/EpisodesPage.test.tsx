import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  EpisodeRepositoryContext,
  type Episode,
  type EpisodeRepositoryPort,
} from '@/entities/episode';
import {
  RobotCatalogContext,
  type RobotCatalogPort,
  type RobotDescriptor,
} from '@/entities/robot';

import { EpisodesPage } from './EpisodesPage';

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

const episode: Episode = {
  id: 'episode-001',
  name: '수집 에피소드 01',
  captureSessionId: 'session-001',
  robotId: robot.id,
  sensorDeviceId: 'sensor-rig-001',
  integrationProfileId: robot.integrationProfileId,
  provenance: {
    environment: 'physical',
    deliveryMode: 'live',
    controlMode: 'teleop',
    dataOrigin: 'captured',
  },
  createdAtMs: 1_000,
  durationMs: 10_000,
  bytesWritten: 1_024,
  streams: [],
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
  overrides: Partial<EpisodeRepositoryPort> = {},
): EpisodeRepositoryPort {
  return {
    listEpisodes: () => Promise.resolve([]),
    queryEpisodes: (query) => Promise.resolve({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      totalItems: 0,
      totalPages: 1,
    }),
    getEpisode: () => Promise.resolve(null),
    createEpisode: () => Promise.reject(new Error('사용하지 않는 명령')),
    subscribe: () => () => undefined,
    ...overrides,
  };
}

function renderPage(
  repository: EpisodeRepositoryPort,
  initialEntry = '/mlops/episodes',
  catalog: RobotCatalogPort = makeRobotCatalog(),
) {
  return render(
    <RobotCatalogContext.Provider value={catalog}>
      <EpisodeRepositoryContext.Provider value={repository}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LocationSearchProbe />
          <EpisodesPage />
        </MemoryRouter>
      </EpisodeRepositoryContext.Provider>
    </RobotCatalogContext.Provider>,
  );
}

describe('EpisodesPage', () => {
  it('동일 조회 갱신 중에도 표와 Pagination 포커스를 유지한다', async () => {
    const episodes = Array.from({ length: 21 }, (_, index): Episode => ({
      ...episode,
      id: `episode-focus-${String(index + 1)}`,
      name: `포커스 에피소드 ${String(index + 1)}`,
    }));
    let invalidate: (() => void) | undefined;
    let resolveRefresh: (
      result: Awaited<ReturnType<EpisodeRepositoryPort['queryEpisodes']>>,
    ) => void = () => undefined;
    const pendingRefresh = new Promise<
      Awaited<ReturnType<EpisodeRepositoryPort['queryEpisodes']>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    const readyResult = {
      items: episodes.slice(0, 20),
      page: 1,
      pageSize: 20,
      totalItems: episodes.length,
      totalPages: 2,
    };
    const queryEpisodes = vi
      .fn<EpisodeRepositoryPort['queryEpisodes']>()
      .mockResolvedValueOnce(readyResult)
      .mockImplementationOnce(() => pendingRefresh);
    renderPage(makeRepository({
      queryEpisodes,
      subscribe: (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    }));

    await screen.findByText('포커스 에피소드 1');
    await waitFor(() => expect(invalidate).toBeDefined());
    const nextPage = screen.getByRole('button', { name: '다음' });
    nextPage.focus();

    act(() => invalidate?.());

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '에피소드 목록' })).toBeInTheDocument();
    expect(nextPage).toHaveFocus();
    expect(nextPage).toHaveAttribute('aria-disabled', 'true');

    await act(async () => {
      resolveRefresh(readyResult);
      await pendingRefresh;
    });
  });

  it('all 검색 문자열을 URL과 에피소드 조회에 보존한다', async () => {
    const user = userEvent.setup();
    const queryEpisodes = vi.fn<EpisodeRepositoryPort['queryEpisodes']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(makeRepository({ queryEpisodes }));
    await waitFor(() => expect(queryEpisodes).toHaveBeenCalledOnce());
    queryEpisodes.mockClear();

    const search = screen.getByRole('searchbox', { name: '에피소드 검색' });
    await user.type(search, 'all');

    await waitFor(() => expect(queryEpisodes).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'all' }),
    ));
    expect(search).toHaveValue('all');
    expect(screen.getByTestId('location-search')).toHaveTextContent('?search=all');
  });

  it('실제 all 로봇 ID를 전체와 구분해 URL과 조회에 보존한다', async () => {
    const user = userEvent.setup();
    const allIdEpisode: Episode = {
      ...episode,
      id: 'episode-all',
      name: 'all ID 에피소드',
      robotId: allIdRobot.id,
    };
    const queryEpisodes = vi.fn<EpisodeRepositoryPort['queryEpisodes']>((query) =>
      Promise.resolve({
        items: [allIdEpisode],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    renderPage(
      makeRepository({ queryEpisodes }),
      '/mlops/episodes?robotId=all&search=all',
      makeRobotCatalog(() => Promise.resolve([allIdRobot, robot])),
    );

    await screen.findByText(allIdEpisode.name);
    expect(queryEpisodes).toHaveBeenLastCalledWith(
      expect.objectContaining({ robotId: 'all', search: 'all' }),
    );
    expect(screen.getByRole('combobox', { name: '로봇' })).toHaveTextContent(
      allIdRobot.displayName,
    );
    expect(screen.getByTestId('location-search')).toHaveTextContent('robotId=all');
    expect(screen.getByTestId('location-search')).toHaveTextContent('search=all');

    queryEpisodes.mockClear();
    screen.getByRole('combobox', { name: '로봇' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', { name: '전체' });
    await user.keyboard('{Home}{Enter}');

    await waitFor(() => expect(queryEpisodes).toHaveBeenLastCalledWith(
      expect.objectContaining({ robotId: null, search: 'all' }),
    ));
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('robotId=');
    expect(screen.getByTestId('location-search')).toHaveTextContent('search=all');
  });

  it('등록되지 않은 명시적 로봇은 조회하지 않고 전체 필터 복구를 제공한다', async () => {
    const user = userEvent.setup();
    const queryEpisodes = vi.fn<EpisodeRepositoryPort['queryEpisodes']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(
      makeRepository({ queryEpisodes }),
      '/mlops/episodes?robotId=missing-robot',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('missing-robot');
    expect(queryEpisodes).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '전체 로봇 보기' }));

    await waitFor(() => expect(queryEpisodes).toHaveBeenCalledOnce());
    expect(queryEpisodes).toHaveBeenCalledWith(
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
    const queryEpisodes = vi.fn<EpisodeRepositoryPort['queryEpisodes']>((query) =>
      Promise.resolve({
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 1,
      }));
    renderPage(
      makeRepository({ queryEpisodes }),
      '/mlops/episodes?robotId=robot-001',
      makeRobotCatalog(listRobots),
    );

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(queryEpisodes).not.toHaveBeenCalled();

    await act(async () => {
      resolveCatalog?.([robot]);
      await Promise.resolve();
    });

    await waitFor(() => expect(queryEpisodes).toHaveBeenCalledOnce());
  });

  it('필터 없는 조회는 로봇 목록 실패와 격리해 에피소드 결과를 유지한다', async () => {
    const queryEpisodes = vi.fn<EpisodeRepositoryPort['queryEpisodes']>((query) =>
      Promise.resolve({
        items: [episode],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }));
    renderPage(
      makeRepository({ queryEpisodes }),
      '/mlops/episodes',
      makeRobotCatalog(() => Promise.reject(new Error('로봇 목록 실패'))),
    );

    expect(await screen.findByText(episode.name)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('로봇 목록을 불러오지 못했습니다.');
    expect(screen.getByRole('combobox', { name: '로봇' })).toBeDisabled();
    expect(queryEpisodes).toHaveBeenCalledWith(
      expect.objectContaining({ robotId: null }),
    );
  });
});
