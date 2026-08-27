import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  DatasetRepositoryContext,
  type Dataset,
  type DatasetRepositoryPort,
} from '@/entities/dataset';
import {
  EpisodeRepositoryContext,
  type Episode,
  type EpisodeRepositoryPort,
} from '@/entities/episode';
import { createPageResult } from '@/shared/lib/query';
import { ToastProvider } from '@/shared/ui/toast';

import { NewDatasetPage } from './NewDatasetPage';

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

const createdDataset: Dataset = {
  id: 'dataset-created',
  name: '새 데이터셋',
  description: '',
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

function createDatasetRepository(
  createDataset: DatasetRepositoryPort['createDataset'],
): DatasetRepositoryPort {
  return {
    listDatasets: () => Promise.resolve([]),
    queryDatasets: (query) => Promise.resolve(createPageResult([], query)),
    getDataset: () => Promise.resolve(null),
    createDataset,
    updateDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
    subscribe: () => () => undefined,
  };
}

describe('NewDatasetPage', () => {
  it('저장 중 화면을 떠나면 늦은 완료가 현재 경로를 탈취하거나 toast를 표시하지 않는다', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((dataset: Dataset) => void) | undefined;
    const createDataset = vi.fn(
      () => new Promise<Dataset>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(
      <DatasetRepositoryContext.Provider value={createDatasetRepository(createDataset)}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/new']}>
              <Routes>
                <Route path="/mlops/datasets/new" element={<NewDatasetPage />} />
                <Route
                  path="/mlops/datasets"
                  element={(
                    <div>
                      <h1>데이터셋 목록 화면</h1>
                      <Link to="/mlops/datasets/new">새 데이터셋 다시 열기</Link>
                    </div>
                  )}
                />
                <Route path="/mlops/datasets/:datasetId" element={<h1>데이터셋 상세 화면</h1>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    await user.type(
      await screen.findByRole('textbox', { name: '데이터셋 이름' }),
      '새 데이터셋',
    );
    await user.click(screen.getByRole('checkbox', { name: /완료 에피소드/u }));
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(createDataset).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: '데이터셋 편집 영역' })).toHaveFocus();

    await user.click(screen.getByRole('link', { name: /^데이터셋$/u }));
    expect(screen.getByRole('heading', { name: '데이터셋 목록 화면' })).toBeInTheDocument();

    await act(async () => {
      resolveCreate?.(createdDataset);
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: '데이터셋 목록 화면' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '데이터셋 상세 화면' })).not.toBeInTheDocument();
    expect(screen.queryByText('초안 데이터셋을 생성했습니다.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '새 데이터셋 다시 열기' }));
    expect(await screen.findByRole('heading', { name: '데이터셋 상세 화면' })).toBeInTheDocument();
    expect(screen.getByText('초안 데이터셋을 생성했습니다.')).toBeInTheDocument();
    expect(createDataset).toHaveBeenCalledOnce();
  });

  it('생성 중 이탈 후 같은 경로에 재진입하면 기존 command를 이어받아 중복 초안을 만들지 않는다', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((dataset: Dataset) => void) | undefined;
    const createDataset = vi.fn(
      () => new Promise<Dataset>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(
      <DatasetRepositoryContext.Provider value={createDatasetRepository(createDataset)}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/new']}>
              <Routes>
                <Route path="/mlops/datasets/new" element={<NewDatasetPage />} />
                <Route
                  path="/mlops/datasets"
                  element={<Link to="/mlops/datasets/new">새 데이터셋 다시 열기</Link>}
                />
                <Route path="/mlops/datasets/:datasetId" element={<h1>데이터셋 상세 화면</h1>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    await user.type(
      await screen.findByRole('textbox', { name: '데이터셋 이름' }),
      '재진입 데이터셋',
    );
    await user.click(screen.getByRole('checkbox', { name: /완료 에피소드/u }));
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(createDataset).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('link', { name: /^데이터셋$/u }));
    await user.click(screen.getByRole('link', { name: '새 데이터셋 다시 열기' }));

    expect(
      await screen.findByRole('group', { name: '데이터셋 편집' }),
    ).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button', { name: '초안 저장' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(createDataset).toHaveBeenCalledOnce();

    await act(async () => {
      resolveCreate?.(createdDataset);
      await Promise.resolve();
    });

    expect(await screen.findByRole('heading', { name: '데이터셋 상세 화면' })).toBeInTheDocument();
    expect(screen.getByText('초안 데이터셋을 생성했습니다.')).toBeInTheDocument();
    expect(createDataset).toHaveBeenCalledOnce();
  });

  it('생성 중 재진입한 요청이 실패해도 제출 입력과 선택을 보존해 재시도한다', async () => {
    const user = userEvent.setup();
    let rejectCreate: ((reason: Error) => void) | undefined;
    const createDataset = vi
      .fn<DatasetRepositoryPort['createDataset']>()
      .mockImplementationOnce(() => new Promise<Dataset>((_resolve, reject) => {
        rejectCreate = reject;
      }))
      .mockImplementationOnce((input) => Promise.resolve({
        ...createdDataset,
        ...input,
      }));

    render(
      <DatasetRepositoryContext.Provider value={createDatasetRepository(createDataset)}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/new']}>
              <Routes>
                <Route path="/mlops/datasets/new" element={<NewDatasetPage />} />
                <Route
                  path="/mlops/datasets"
                  element={<Link to="/mlops/datasets/new">새 데이터셋 다시 열기</Link>}
                />
                <Route path="/mlops/datasets/:datasetId" element={<h1>데이터셋 상세 화면</h1>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    const name = await screen.findByRole('textbox', { name: '데이터셋 이름' });
    await user.type(name, '실패 뒤 보존할 초안');
    await user.type(screen.getByRole('textbox', { name: '태그' }), 'keep, retry');
    await user.click(screen.getByRole('checkbox', { name: /완료 에피소드/u }));
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(createDataset).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('link', { name: /^데이터셋$/u }));
    await user.click(screen.getByRole('link', { name: '새 데이터셋 다시 열기' }));
    const remountedName = await screen.findByRole('textbox', {
      name: '데이터셋 이름',
    });
    expect(remountedName).toHaveValue('실패 뒤 보존할 초안');
    expect(remountedName).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '태그' })).toHaveValue('keep, retry');
    expect(screen.getByRole('checkbox', { name: /완료 에피소드/u })).toBeChecked();

    await act(async () => {
      rejectCreate?.(new Error('재진입 생성 실패'));
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('재진입 생성 실패');
    expect(remountedName).toHaveValue('실패 뒤 보존할 초안');
    expect(remountedName).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /완료 에피소드/u })).toBeChecked();

    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(createDataset).toHaveBeenCalledTimes(2));
    expect(createDataset.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      name: '실패 뒤 보존할 초안',
      tags: ['keep', 'retry'],
      episodeIds: [episode.id],
    }));
  });

  it('생성 중 initial Episode scope가 바뀌면 이전 결과를 새 생성 흐름이 소비하지 않는다', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((dataset: Dataset) => void) | undefined;
    const createDataset = vi.fn(
      () => new Promise<Dataset>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(
      <DatasetRepositoryContext.Provider value={createDatasetRepository(createDataset)}>
        <EpisodeRepositoryContext.Provider value={createEpisodeRepository()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/mlops/datasets/new?episodeId=episode-1']}>
              <Routes>
                <Route
                  path="/mlops/datasets/new"
                  element={(
                    <div>
                      <Link to="/mlops/datasets/new">자동 선택 해제</Link>
                      <NewDatasetPage />
                    </div>
                  )}
                />
                <Route path="/mlops/datasets/:datasetId" element={<h1>데이터셋 상세 화면</h1>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </EpisodeRepositoryContext.Provider>
      </DatasetRepositoryContext.Provider>,
    );

    await user.type(
      await screen.findByRole('textbox', { name: '데이터셋 이름' }),
      '자동 선택 데이터셋',
    );
    await user.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(createDataset).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('link', { name: '자동 선택 해제' }));
    expect(await screen.findByRole('textbox', { name: '데이터셋 이름' })).toBeEnabled();
    expect(
      screen.getByRole('group', { name: '데이터셋 편집' }),
    ).not.toHaveAttribute('aria-busy');

    await act(async () => {
      resolveCreate?.(createdDataset);
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: '새 데이터셋' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '데이터셋 상세 화면' })).not.toBeInTheDocument();
    expect(screen.queryByText('초안 데이터셋을 생성했습니다.')).not.toBeInTheDocument();
    expect(createDataset).toHaveBeenCalledOnce();
  });
});
