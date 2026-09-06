import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  EpisodeRepositoryContext,
  type Episode,
  type EpisodeQuery,
  type EpisodeRepositoryPort,
} from '@/entities/episode';
import type { Dataset } from '@/entities/dataset';
import { createPageResult } from '@/shared/lib/query';

import { DatasetEditor } from './DatasetEditor';

const episode: Episode = {
  id: 'episode-1',
  name: '완료 Episode',
  captureSessionId: 'session-1',
  robotId: 'robot-1',
  sensorDeviceId: 'rig-1',
  integrationProfileId: 'profile-v1',
  provenance: {
    environment: 'simulation',
    deliveryMode: 'replay',
    controlMode: 'teleop',
    dataOrigin: 'synthetic',
  },
  createdAtMs: 0,
  durationMs: 10_000,
  bytesWritten: 1_000,
  streams: [],
};

function createEpisodes(count: number): readonly Episode[] {
  return Array.from({ length: count }, (_, index) => ({
    ...episode,
    id: `episode-${String(index + 1)}`,
    name: `완료 Episode ${String(index + 1)}`,
    createdAtMs: index,
  }));
}

interface TestEpisodeRepository extends EpisodeRepositoryPort {
  readonly getEpisodeMock: ReturnType<typeof vi.fn>;
  readonly queryEpisodesMock: ReturnType<typeof vi.fn>;
}

function createEpisodeRepository(
  episodes: readonly Episode[] = [episode],
): TestEpisodeRepository {
  const queryEpisodesMock = vi.fn((query: EpisodeQuery) => {
    const search = query.search.toLocaleLowerCase();
    const filtered = episodes.filter((item) =>
      item.name.toLocaleLowerCase().includes(search));
    return Promise.resolve(createPageResult(filtered, query));
  });
  const getEpisodeMock = vi.fn((episodeId: string) =>
    Promise.resolve(episodes.find((item) => item.id === episodeId) ?? null));
  return {
    listEpisodes: () => Promise.resolve(episodes),
    queryEpisodes: queryEpisodesMock,
    getEpisode: getEpisodeMock,
    createEpisode: () => Promise.resolve(episode),
    subscribe: () => () => undefined,
    getEpisodeMock,
    queryEpisodesMock,
  };
}

describe('DatasetEditor', () => {
  it('수정하지 않은 편집기는 같은 Dataset의 새 query 값을 반영한다', async () => {
    const repository = createEpisodeRepository();
    const dataset: Dataset = {
      id: 'dataset-sync',
      name: '동기화 전 이름',
      description: '동기화 전 설명',
      tags: [],
      episodeIds: [episode.id],
      status: 'draft',
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    const { rerender } = render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor dataset={dataset} onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    expect(await screen.findByRole('textbox', {
      name: '데이터셋 이름',
    })).toHaveValue('동기화 전 이름');

    rerender(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor
          dataset={{
            ...dataset,
            name: '동기화 후 이름',
            description: '동기화 후 설명',
            updatedAtMs: 1,
          }}
          onSave={() => Promise.resolve()}
        />
      </EpisodeRepositoryContext.Provider>,
    );

    await waitFor(() => expect(screen.getByRole('textbox', {
      name: '데이터셋 이름',
    })).toHaveValue('동기화 후 이름'));
    expect(screen.getByRole('textbox', { name: '설명' })).toHaveValue(
      '동기화 후 설명',
    );
  });

  it('현재 페이지 밖의 기존 Episode 연결을 알리고 저장 시 보존한다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const episodes = createEpisodes(25);
    const dataset: Dataset = {
      id: 'dataset-1',
      name: '기존 데이터셋',
      description: '연결 보존 검증',
      tags: [],
      episodeIds: ['episode-1', 'episode-25'],
      status: 'draft',
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    render(
      <EpisodeRepositoryContext.Provider value={createEpisodeRepository(episodes)}>
        <DatasetEditor dataset={dataset} onSave={onSave} />
      </EpisodeRepositoryContext.Provider>,
    );

    expect(await screen.findByText('에피소드 ID: episode-25')).toBeInTheDocument();
    expect(screen.getByText(/표시되지 않은 선택 1개를/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      episodeIds: ['episode-1', 'episode-25'],
    }));
  });

  it('현재 목록 밖의 선택을 해제한 뒤 에피소드 검색으로 포커스를 이동한다', async () => {
    const user = userEvent.setup();
    const dataset: Dataset = {
      id: 'dataset-1',
      name: '기존 데이터셋',
      description: '선택 해제 포커스 검증',
      tags: [],
      episodeIds: ['episode-1', 'episode-25'],
      status: 'draft',
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    render(
      <EpisodeRepositoryContext.Provider value={createEpisodeRepository(createEpisodes(25))}>
        <DatasetEditor dataset={dataset} onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    const removeSelection = await screen.findByRole('button', {
      name: '에피소드 ID: episode-25 선택 해제',
    });
    removeSelection.focus();
    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('searchbox', { name: '구성할 에피소드 검색' }),
    ).toHaveFocus();
    expect(screen.queryByText('에피소드 ID: episode-25')).not.toBeInTheDocument();
  });

  it('URL에서 전달된 존재하는 Episode만 자동 선택한다', async () => {
    const repository = createEpisodeRepository();
    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor initialEpisodeId="episode-1" onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    expect(
      await screen.findByRole('checkbox', { name: /완료 Episode/ }),
    ).toBeChecked();
    expect(repository.getEpisodeMock).toHaveBeenCalledWith('episode-1');
  });

  it('자동 선택 Episode 갱신 실패를 알리고 기존 선택을 유지한 채 복구한다', async () => {
    const user = userEvent.setup();
    const listeners = new Set<() => void>();
    const repository = createEpisodeRepository();
    repository.subscribe = (nextListener) => {
      listeners.add(nextListener);
      return () => {
        listeners.delete(nextListener);
      };
    };

    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor initialEpisodeId="episode-1" onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    expect(
      await screen.findByRole('checkbox', { name: /완료 Episode/ }),
    ).toBeChecked();
    repository.getEpisodeMock.mockRejectedValueOnce(new Error('Episode 최신화 실패'));
    act(() => listeners.forEach((listener) => listener()));

    expect(await screen.findByRole('alert')).toHaveTextContent('Episode 최신화 실패');
    expect(screen.getByRole('checkbox', { name: /완료 Episode/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: '다시 확인하기' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(repository.getEpisodeMock).toHaveBeenCalledTimes(3);
  });

  it('존재하지 않는 Episode ID를 선택값으로 조작하지 않는다', async () => {
    const repository = createEpisodeRepository();
    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor initialEpisodeId="missing-episode" onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    expect(
      await screen.findByText(/요청한 에피소드를 찾지 못해 자동 선택하지 않았습니다/),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /완료 Episode/ })).not.toBeChecked();
    expect(repository.getEpisodeMock).toHaveBeenCalledWith('missing-episode');
  });

  it('페이지를 이동해도 선택을 보존하고 현재 페이지 선택을 함께 저장한다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const repository = createEpisodeRepository(createEpisodes(25));
    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor onSave={onSave} />
      </EpisodeRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.type(name, '페이지 선택 Dataset');
    await user.click(screen.getByRole('checkbox', { name: /^완료 Episode 1 ·/ }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    const episode21 = await screen.findByRole('checkbox', { name: /^완료 Episode 21 ·/ });
    await user.click(episode21);

    expect(screen.getByText('에피소드 ID: episode-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      episodeIds: ['episode-1', 'episode-21'],
    }));
  });

  it('첫 페이지 밖의 URL Episode를 getEpisode로 검증하고 해당 페이지에서 선택을 표시한다', async () => {
    const user = userEvent.setup();
    const episodes = createEpisodes(25);
    const repository = createEpisodeRepository(episodes);
    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor initialEpisodeId="episode-25" onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    expect(await screen.findByText('완료 Episode 25 · episode-25')).toBeInTheDocument();
    expect(repository.getEpisodeMock).toHaveBeenCalledWith('episode-25');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(
      await screen.findByRole('checkbox', { name: /^완료 Episode 25 ·/ }),
    ).toBeChecked();
  });

  it('검색 시 첫 페이지부터 queryEpisodes로 다시 조회한다', async () => {
    const user = userEvent.setup();
    const repository = createEpisodeRepository(createEpisodes(25));
    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    await screen.findByRole('checkbox', { name: /^완료 Episode 1 ·/ });
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('checkbox', { name: /^완료 Episode 21 ·/ });
    await user.type(screen.getByRole('searchbox', { name: '구성할 에피소드 검색' }), '25');

    expect(
      await screen.findByRole('checkbox', { name: /^완료 Episode 25 ·/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(repository.queryEpisodesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, search: '25' }),
    ));
  });

  it('폼 오류를 표시하고 Episode를 선택한 명시적 저장만 전달한다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const repository = createEpisodeRepository();
    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor onSave={onSave} />
      </EpisodeRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('데이터셋 이름을 입력해야 합니다.');
    expect(onSave).not.toHaveBeenCalled();

    await user.type(name, '통합 Dataset');
    expect(name).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('checkbox', { name: /완료 Episode/ }));
    await user.click(screen.getByRole('button', { name: '초안 저장' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: '통합 Dataset',
      episodeIds: ['episode-1'],
    }));
  });

  it('기존 Dataset 저장이 끝날 때까지 제출값을 바꾸는 모든 컨트롤을 잠근다', async () => {
    const user = userEvent.setup();
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const dataset: Dataset = {
      id: 'dataset-1',
      name: '저장 중 Dataset',
      description: '저장 중 설명',
      tags: ['검증', '잠금'],
      episodeIds: ['episode-1', 'episode-25'],
      status: 'draft',
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    render(
      <EpisodeRepositoryContext.Provider value={createEpisodeRepository(createEpisodes(25))}>
        <DatasetEditor dataset={dataset} onSave={onSave} />
      </EpisodeRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    const description = screen.getByRole('textbox', { name: '설명' });
    const tags = screen.getByRole('textbox', { name: '태그' });
    const search = screen.getByRole('searchbox', { name: '구성할 에피소드 검색' });
    const episodeCheckbox = screen.getByRole('checkbox', { name: /^완료 Episode 1 ·/ });
    const clearOutsideSelection = screen.getByRole('button', {
      name: '에피소드 ID: episode-25 선택 해제',
    });
    const nextPage = screen.getByRole('button', { name: '다음' });

    await user.click(screen.getByRole('button', { name: '초안 저장' }));

    expect(onSave).toHaveBeenCalledWith({
      name: '저장 중 Dataset',
      description: '저장 중 설명',
      tags: ['검증', '잠금'],
      episodeIds: ['episode-1', 'episode-25'],
    });
    expect(
      screen.getByRole('group', { name: '데이터셋 편집' }),
    ).not.toHaveAttribute('aria-busy');
    const savingStatus = screen.getByText('데이터셋을 저장하는 중입니다.');
    expect(savingStatus).toHaveAttribute('role', 'status');
    expect(savingStatus.closest('[aria-busy="true"]')).toBeNull();
    expect(name).toBeDisabled();
    expect(description).toBeDisabled();
    expect(tags).toBeDisabled();
    expect(search).toBeDisabled();
    expect(episodeCheckbox).toBeDisabled();
    expect(clearOutsideSelection).toBeDisabled();
    expect(nextPage).toBeDisabled();
    expect(screen.getByRole('button', { name: '초안 저장' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    resolveSave?.();
    await waitFor(() => expect(name).toBeEnabled());
    expect(description).toBeEnabled();
    expect(tags).toBeEnabled();
    expect(search).toBeEnabled();
    expect(episodeCheckbox).toBeEnabled();
    expect(clearOutsideSelection).toBeEnabled();
    expect(nextPage).toBeEnabled();
    expect(
      screen.getByRole('group', { name: '데이터셋 편집' }),
    ).not.toHaveAttribute('aria-busy');
  });

  it('저장 중 중복 제출을 막고 실패해도 입력값을 보존한다', async () => {
    const user = userEvent.setup();
    let rejectSave: ((reason: Error) => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    render(
      <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
        <DatasetEditor onSave={onSave} />
      </EpisodeRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.type(name, '보존할 Dataset');
    await user.click(screen.getByRole('checkbox', { name: /완료 Episode/ }));
    const saveButton = screen.getByRole('button', { name: '초안 저장' });

    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledOnce();

    rejectSave?.(new Error('저장 실패'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('데이터셋 저장에 실패했습니다. 연결 상태를 확인하고 다시 시도하세요.'));
    expect(screen.queryByText('저장 실패')).not.toBeInTheDocument();
    expect(name).toHaveValue('보존할 Dataset');
    expect(screen.getByRole('checkbox', { name: /완료 Episode/ })).toBeChecked();
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeEnabled();
  });

  it('동일 Episode 조회 갱신 중에도 checkbox와 포커스를 유지한다', async () => {
    let invalidate: (() => void) | undefined;
    let resolveRefresh: (
      result: Awaited<ReturnType<EpisodeRepositoryPort['queryEpisodes']>>,
    ) => void = () => undefined;
    const pendingRefresh = new Promise<
      Awaited<ReturnType<EpisodeRepositoryPort['queryEpisodes']>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    const baseRepository = createEpisodeRepository();
    const readyResult = createPageResult([episode], { page: 1, pageSize: 20 });
    const queryEpisodes = vi
      .fn<EpisodeRepositoryPort['queryEpisodes']>()
      .mockResolvedValueOnce(readyResult)
      .mockImplementationOnce(() => pendingRefresh);
    const repository: TestEpisodeRepository = {
      ...baseRepository,
      queryEpisodes,
      queryEpisodesMock: queryEpisodes,
      subscribe: (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    };
    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    const checkbox = await screen.findByRole('checkbox', { name: /완료 Episode/u });
    checkbox.focus();
    await waitFor(() => expect(invalidate).toBeDefined());

    act(() => invalidate?.());

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveFocus();

    await act(async () => {
      resolveRefresh(readyResult);
      await pendingRefresh;
    });
  });

  it('Episode 갱신 실패 시 기존 선택 목록을 유지하고 재시도한다', async () => {
    const user = userEvent.setup();
    let invalidate: (() => void) | undefined;
    let queryCallCount = 0;
    const baseRepository = createEpisodeRepository();
    const queryEpisodes = vi.fn<EpisodeRepositoryPort['queryEpisodes']>((query) => {
      queryCallCount += 1;
      return queryCallCount === 2
        ? Promise.reject(new Error('Episode 갱신 실패'))
        : Promise.resolve(createPageResult([episode], query));
    });
    const repository: TestEpisodeRepository = {
      ...baseRepository,
      queryEpisodes,
      queryEpisodesMock: queryEpisodes,
      subscribe: (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    };
    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <DatasetEditor onSave={() => Promise.resolve()} />
      </EpisodeRepositoryContext.Provider>,
    );

    await screen.findByRole('checkbox', {
      name: /완료 Episode/u,
    });
    await waitFor(() => expect(invalidate).toBeDefined());
    act(() => invalidate?.());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Episode 갱신 실패',
    );
    expect(
      screen.getByRole('checkbox', { name: /완료 Episode/u }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: '에피소드 다시 불러오기' }),
    );

    await waitFor(() => expect(queryEpisodes).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.queryByText(/Episode 갱신 실패/u)).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('checkbox', { name: /완료 Episode/u }),
    ).toBeInTheDocument();
  });
});
