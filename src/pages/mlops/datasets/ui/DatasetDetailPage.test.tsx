import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  DatasetRepositoryContext,
  type Dataset,
  type DatasetRepositoryPort,
  type UpdateDatasetInput,
} from '@/entities/dataset';
import {
  EpisodeRepositoryContext,
  type Episode,
  type EpisodeRepositoryPort,
} from '@/entities/episode';
import { createPageResult } from '@/shared/lib/query';
import { ToastProvider } from '@/shared/ui/toast';

import { DatasetDetailPage } from './DatasetDetailPage';

const episode: Episode = {
  id: 'episode-1',
  name: '완료 에피소드',
  captureSessionId: 'session-1',
  robotId: 'robot-1',
  sensorDeviceId: 'rig-1',
  integrationProfileId: 'profile-1',
  provenance: {
    environment: 'physical',
    deliveryMode: 'live',
    controlMode: 'teleop',
    dataOrigin: 'captured',
  },
  createdAtMs: 1,
  durationMs: 1_000,
  bytesWritten: 1_000,
  streams: [],
};

const initialDataset: Dataset = {
  id: 'dataset-1',
  name: '기존 데이터셋',
  description: '기존 설명',
  tags: [],
  episodeIds: [episode.id],
  status: 'draft',
  createdAtMs: 1,
  updatedAtMs: 1,
};

function createEpisodeRepository(): EpisodeRepositoryPort {
  return {
    listEpisodes: () => Promise.resolve([episode]),
    queryEpisodes: (query) => Promise.resolve(createPageResult([episode], query)),
    getEpisode: (episodeId) => Promise.resolve(episodeId === episode.id ? episode : null),
    createEpisode: () => Promise.resolve(episode),
    subscribe: () => () => undefined,
  };
}

describe('DatasetDetailPage', () => {
  it('동일 데이터셋 갱신이 완료돼도 저장하지 않은 입력과 포커스를 보존한다', async () => {
    const user = userEvent.setup();
    const listeners = new Set<() => void>();
    let currentDataset = initialDataset;
    const repository: DatasetRepositoryPort = {
      listDatasets: () => Promise.resolve([currentDataset]),
      queryDatasets: (query) => Promise.resolve(createPageResult([currentDataset], query)),
      getDataset: () => Promise.resolve(currentDataset),
      createDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      updateDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    render(
      <DatasetRepositoryContext.Provider value={repository}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/dataset-1']}>
              <Routes>
                <Route path="/mlops/datasets/:datasetId" element={<DatasetDetailPage />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.clear(name);
    await user.type(name, '저장하지 않은 편집 이름');
    await user.type(screen.getByRole('textbox', { name: '태그' }), '작성 중');
    name.focus();

    currentDataset = {
      ...initialDataset,
      name: '외부에서 갱신된 이름',
      description: '외부에서 갱신된 설명',
      updatedAtMs: 2,
    };
    act(() => listeners.forEach((listener) => listener()));

    expect(await screen.findByRole('heading', {
      name: '외부에서 갱신된 이름',
    })).toBeInTheDocument();
    expect(name).toHaveValue('저장하지 않은 편집 이름');
    expect(screen.getByRole('textbox', { name: '태그' })).toHaveValue('작성 중');
    expect(name).toHaveFocus();
  });

  it('저장 성공으로 편집기가 교체돼도 포커스를 편집 결과 영역에 유지한다', async () => {
    const user = userEvent.setup();
    let completeUpdate: ((dataset: Dataset) => void) | undefined;
    const updateDataset = vi.fn<DatasetRepositoryPort['updateDataset']>(
      (input) => new Promise<Dataset>((resolve) => {
        completeUpdate = resolve;
        expect(input.name).toBe('포커스를 유지할 이름');
      }),
    );
    const repository: DatasetRepositoryPort = {
      listDatasets: () => Promise.resolve([initialDataset]),
      queryDatasets: (query) => Promise.resolve(createPageResult([initialDataset], query)),
      getDataset: () => Promise.resolve(initialDataset),
      createDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      updateDataset,
      subscribe: () => () => undefined,
    };

    render(
      <DatasetRepositoryContext.Provider value={repository}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/dataset-1']}>
              <Routes>
                <Route path="/mlops/datasets/:datasetId" element={<DatasetDetailPage />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.clear(name);
    await user.type(name, '포커스를 유지할 이름');
    const saveButton = screen.getByRole('button', { name: '초안 저장' });
    await user.click(saveButton);
    expect(screen.getByRole('region', { name: '데이터셋 편집 영역' })).toHaveFocus();

    await act(async () => {
      completeUpdate?.({
        ...initialDataset,
        name: '포커스를 유지할 이름',
        updatedAtMs: 2,
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(
      screen.getByRole('region', { name: '데이터셋 편집 영역' }),
    ).toHaveFocus());
    expect(screen.getByText('초안 데이터셋을 저장했습니다.')).toBeInTheDocument();
  });

  it('수정 중 재진입은 pending을 이어받고 정규화 Query가 달라도 영구 잠그지 않는다', async () => {
    const user = userEvent.setup();
    const listeners = new Set<() => void>();
    let currentDataset = initialDataset;
    let completeUpdate: (() => void) | undefined;
    const updateDataset = vi.fn(
      (input: UpdateDatasetInput) => new Promise<Dataset>((resolve) => {
        completeUpdate = () => {
          const commandResult: Dataset = {
            ...currentDataset,
            ...input,
            updatedAtMs: 1,
          };
          currentDataset = {
            ...commandResult,
            tags: [...commandResult.tags].reverse(),
          };
          listeners.forEach((listener) => listener());
          resolve(commandResult);
        };
      }),
    );
    const repository: DatasetRepositoryPort = {
      listDatasets: () => Promise.resolve([currentDataset]),
      queryDatasets: (query) => Promise.resolve(createPageResult([currentDataset], query)),
      getDataset: (datasetId) => Promise.resolve(
        datasetId === currentDataset.id ? currentDataset : null,
      ),
      createDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      updateDataset,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    render(
      <DatasetRepositoryContext.Provider value={repository}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/dataset-1']}>
              <Routes>
                <Route path="/mlops/datasets/:datasetId" element={<DatasetDetailPage />} />
                <Route
                  path="/mlops/datasets"
                  element={<Link to="/mlops/datasets/dataset-1">데이터셋 상세 다시 열기</Link>}
                />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.clear(name);
    await user.type(name, '첫 번째 수정');
    await user.type(screen.getByRole('textbox', { name: '태그' }), 'beta, alpha');
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(updateDataset).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('link', { name: '데이터셋으로' }));
    await user.click(screen.getByRole('link', { name: '데이터셋 상세 다시 열기' }));

    const reenteredName = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    expect(reenteredName).toBeDisabled();
    expect(
      screen.getByRole('group', { name: '데이터셋 편집' }),
    ).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button', { name: '초안 저장' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(updateDataset).toHaveBeenCalledOnce();

    await act(async () => {
      completeUpdate?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(
      screen.getByRole('textbox', { name: '데이터셋 이름' }),
    ).toHaveValue('첫 번째 수정'));
    expect(screen.getByRole('textbox', { name: '데이터셋 이름' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: '태그' })).toHaveValue('beta, alpha');
    expect(screen.getByText('beta, alpha')).toBeInTheDocument();
    expect(screen.getByText('초안 데이터셋을 저장했습니다.')).toBeInTheDocument();
    expect(updateDataset).toHaveBeenCalledOnce();
  });

  it('수정 중 재진입한 요청이 실패해도 제출 입력을 보존해 다시 저장할 수 있다', async () => {
    const user = userEvent.setup();
    let rejectUpdate: ((reason: Error) => void) | undefined;
    const updateDataset = vi
      .fn<DatasetRepositoryPort['updateDataset']>()
      .mockImplementationOnce(() => new Promise<Dataset>((_resolve, reject) => {
        rejectUpdate = reject;
      }))
      .mockImplementationOnce((input) => Promise.resolve({
        ...initialDataset,
        ...input,
        updatedAtMs: 2,
      }));
    const repository: DatasetRepositoryPort = {
      listDatasets: () => Promise.resolve([initialDataset]),
      queryDatasets: (query) => Promise.resolve(createPageResult([initialDataset], query)),
      getDataset: () => Promise.resolve(initialDataset),
      createDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      updateDataset,
      subscribe: () => () => undefined,
    };

    render(
      <DatasetRepositoryContext.Provider value={repository}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/dataset-1']}>
              <Routes>
                <Route path="/mlops/datasets/:datasetId" element={<DatasetDetailPage />} />
                <Route
                  path="/mlops/datasets"
                  element={<Link to="/mlops/datasets/dataset-1">데이터셋 상세 다시 열기</Link>}
                />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.clear(name);
    await user.type(name, '실패 뒤 보존할 이름');
    await user.type(screen.getByRole('textbox', { name: '태그' }), 'retry-tag');
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(updateDataset).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('link', { name: '데이터셋으로' }));
    await user.click(screen.getByRole('link', { name: '데이터셋 상세 다시 열기' }));
    const remountedName = await screen.findByRole('textbox', {
      name: '데이터셋 이름',
    });
    expect(remountedName).toHaveValue('실패 뒤 보존할 이름');
    expect(remountedName).toBeDisabled();

    await act(async () => {
      rejectUpdate?.(new Error('재마운트 저장 실패'));
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('재마운트 저장 실패');
    expect(remountedName).toHaveValue('실패 뒤 보존할 이름');
    expect(screen.getByRole('textbox', { name: '태그' })).toHaveValue('retry-tag');
    expect(remountedName).toBeEnabled();

    await user.clear(remountedName);
    await user.type(remountedName, '재시도 이름');
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(updateDataset).toHaveBeenCalledTimes(2));
    expect(updateDataset.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      name: '재시도 이름',
      tags: ['retry-tag'],
    }));
  });

  it('저장 후 상세 재조회가 실패해도 command 결과 입력을 유지하고 편집 잠금을 해제한다', async () => {
    const user = userEvent.setup();
    const listeners = new Set<() => void>();
    let currentDataset = initialDataset;
    let failNextRead = false;
    const updateDataset = vi.fn<DatasetRepositoryPort['updateDataset']>((input) => {
      currentDataset = {
        ...currentDataset,
        ...input,
        updatedAtMs: 1,
      };
      failNextRead = true;
      listeners.forEach((listener) => listener());
      return Promise.resolve(currentDataset);
    });
    const repository: DatasetRepositoryPort = {
      listDatasets: () => Promise.resolve([currentDataset]),
      queryDatasets: (query) => Promise.resolve(createPageResult([currentDataset], query)),
      getDataset: () => {
        if (failNextRead) {
          failNextRead = false;
          return Promise.reject(new Error('저장 후 상세 재조회 실패'));
        }
        return Promise.resolve(currentDataset);
      },
      createDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      updateDataset,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    render(
      <DatasetRepositoryContext.Provider value={repository}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/dataset-1']}>
              <Routes>
                <Route path="/mlops/datasets/:datasetId" element={<DatasetDetailPage />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.clear(name);
    await user.type(name, '재조회 실패에도 유지할 이름');
    await user.click(screen.getByRole('button', { name: '초안 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('저장 후 상세 재조회 실패');
    expect(screen.getByRole('textbox', { name: '데이터셋 이름' })).toHaveValue(
      '재조회 실패에도 유지할 이름',
    );
    expect(screen.getByRole('heading', { name: '재조회 실패에도 유지할 이름' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '데이터셋 이름' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '초안 저장' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect(updateDataset).toHaveBeenCalledOnce();
  });
});
