import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DatasetRepositoryContext,
  type Dataset,
  type DatasetRepositoryPort,
} from '@/entities/dataset';

import { DatasetsPage } from './DatasetsPage';

const allTaggedDataset: Dataset = {
  id: 'dataset-all',
  name: 'all 검색 데이터셋',
  description: 'all 태그 필터 검증',
  tags: ['all'],
  episodeIds: ['episode-001'],
  status: 'draft',
  createdAtMs: 1,
  updatedAtMs: 1,
};

function LocationSearchProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
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
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  return vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Blob 텍스트를 읽지 못했습니다.'));
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

describe('DatasetsPage', () => {
  it('동일 조회 갱신 중에도 표와 페이지 포커스를 유지한다', async () => {
    const datasets = Array.from({ length: 21 }, (_, index): Dataset => ({
      ...allTaggedDataset,
      id: `dataset-${String(index + 1)}`,
      name: `포커스 데이터셋 ${String(index + 1)}`,
    }));
    let invalidate: (() => void) | undefined;
    let resolveRefresh: (
      result: Awaited<ReturnType<DatasetRepositoryPort['queryDatasets']>>,
    ) => void = () => undefined;
    const pendingRefresh = new Promise<
      Awaited<ReturnType<DatasetRepositoryPort['queryDatasets']>>
    >((resolve) => {
      resolveRefresh = resolve;
    });
    const firstPage = {
      items: datasets.slice(0, 20),
      page: 1,
      pageSize: 20,
      totalItems: datasets.length,
      totalPages: 2,
    };
    const queryDatasets = vi
      .fn<DatasetRepositoryPort['queryDatasets']>()
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(() => pendingRefresh);
    const repository: DatasetRepositoryPort = {
      listDatasets: () => Promise.resolve(datasets),
      queryDatasets,
      getDataset: () => Promise.resolve(null),
      createDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      updateDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      subscribe: (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    };

    render(
      <DatasetRepositoryContext.Provider value={repository}>
        <MemoryRouter initialEntries={['/mlops/datasets']}>
          <DatasetsPage />
        </MemoryRouter>
      </DatasetRepositoryContext.Provider>,
    );

    await screen.findByText('포커스 데이터셋 1');
    await waitFor(() => expect(invalidate).toBeDefined());
    const nextPage = screen.getByRole('button', { name: '다음' });
    nextPage.focus();

    act(() => invalidate?.());

    expect(await screen.findByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '데이터셋 목록' })).toBeInTheDocument();
    expect(nextPage).toHaveFocus();
    expect(nextPage).toHaveAttribute('aria-disabled', 'true');

    await act(async () => {
      resolveRefresh(firstPage);
      await pendingRefresh;
    });
  });

  it('all 문자열을 검색어와 실제 exact 태그로 보존하고 빈 태그만 전체로 조회한다', async () => {
    const user = userEvent.setup();
    const queryDatasets = vi.fn<DatasetRepositoryPort['queryDatasets']>((query) => {
      const items = query.search === 'all' && query.tag === 'all'
        ? [allTaggedDataset]
        : [];
      return Promise.resolve({
        items,
        page: query.page,
        pageSize: query.pageSize,
        totalItems: items.length,
        totalPages: 1,
      });
    });
    const repository: DatasetRepositoryPort = {
      listDatasets: () => Promise.resolve([]),
      queryDatasets,
      getDataset: () => Promise.resolve(null),
      createDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      updateDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      subscribe: () => () => undefined,
    };

    render(
      <DatasetRepositoryContext.Provider value={repository}>
        <MemoryRouter initialEntries={['/mlops/datasets']}>
          <LocationSearchProbe />
          <DatasetsPage />
        </MemoryRouter>
      </DatasetRepositoryContext.Provider>,
    );

    const searchInput = await screen.findByRole('searchbox', {
      name: '데이터셋 또는 태그 검색',
    });
    const tagInput = screen.getByRole('searchbox', {
      name: '정확히 일치하는 태그',
    });

    await user.type(searchInput, 'all');
    await user.type(tagInput, 'all');

    await waitFor(() => expect(queryDatasets).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'all', tag: 'all' }),
    ));
    expect(await screen.findByText(allTaggedDataset.name)).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('search=all');
    expect(screen.getByTestId('location-search')).toHaveTextContent('tag=all');

    await user.clear(tagInput);

    await waitFor(() => expect(queryDatasets).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'all', tag: null }),
    ));
    expect(screen.getByTestId('location-search')).toHaveTextContent('search=all');
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('tag=');
    expect(screen.getByText('전체 태그')).toBeInTheDocument();
  });

  it('JSON 내보내기에서 태그와 Episode ID 배열 구조를 보존한다', async () => {
    const user = userEvent.setup();
    const dataset: Dataset = {
      ...allTaggedDataset,
      tags: ['alpha|beta', 'gamma'],
      episodeIds: ['episode|one', 'episode-two'],
    };
    const repository: DatasetRepositoryPort = {
      listDatasets: () => Promise.resolve([dataset]),
      queryDatasets: (query) => Promise.resolve({
        items: [dataset],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 1,
        totalPages: 1,
      }),
      getDataset: () => Promise.resolve(dataset),
      createDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      updateDataset: () => Promise.reject(new Error('사용하지 않는 명령')),
      subscribe: () => () => undefined,
    };
    const createObjectUrl = installDownloadSpies();

    render(
      <DatasetRepositoryContext.Provider value={repository}>
        <MemoryRouter initialEntries={['/mlops/datasets']}>
          <DatasetsPage />
        </MemoryRouter>
      </DatasetRepositoryContext.Provider>,
    );

    await screen.findByText(dataset.name);
    await user.click(screen.getByRole('button', { name: '데이터셋 내보내기' }));
    await user.click(await screen.findByRole('menuitem', { name: 'JSON 내보내기' }));
    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledOnce());
    const blob = createObjectUrl.mock.calls[0]?.[0];
    if (!(blob instanceof Blob)) throw new Error('내보낸 Blob을 확인할 수 없습니다.');
    const exported = JSON.parse(await readBlob(blob)) as readonly Record<string, unknown>[];

    expect(exported[0]?.tags).toEqual(dataset.tags);
    expect(exported[0]?.episodeIds).toEqual(dataset.episodeIds);
  });
});
