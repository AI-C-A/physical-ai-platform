import { describe, expect, it, vi } from 'vitest';

import { InMemoryDatasetRepository } from './in-memory-dataset-repository';

describe('InMemoryDatasetRepository', () => {
  it('이름·설명·태그에 같은 검색 조건을 적용한다', async () => {
    const repository = new InMemoryDatasetRepository([{
      id: 'dataset-1',
      name: '보행 데이터',
      description: '창고 야간 경로 검증',
      tags: ['indoor'],
      episodeIds: ['episode-1'],
      status: 'draft',
      createdAtMs: 100,
      updatedAtMs: 100,
    }]);
    const baseQuery = {
      tag: null,
      sort: 'updated-desc' as const,
      page: 1,
      pageSize: 20,
    };

    await expect(repository.queryDatasets({ ...baseQuery, search: '  야간  ' }))
      .resolves.toMatchObject({ totalItems: 1 });
    await expect(repository.queryDatasets({ ...baseQuery, search: 'INDOOR' }))
      .resolves.toMatchObject({ totalItems: 1 });
    await expect(repository.queryDatasets({ ...baseQuery, search: ' DATASET-1 ' }))
      .resolves.toMatchObject({ totalItems: 1 });
  });

  it('Episode 구성과 draft 상태를 보존하며 생성·수정한다', async () => {
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(200);
    const repository = new InMemoryDatasetRepository([], now);

    const created = await repository.createDataset({
      name: '보행 Dataset',
      description: '합성 Capture 결과',
      tags: ['walking', 'synthetic'],
      episodeIds: ['episode-1', 'episode-2'],
    });
    const updated = await repository.updateDataset({
      ...created,
      name: '보행 Dataset v2',
      episodeIds: ['episode-2'],
    });

    expect(created.status).toBe('draft');
    expect(updated).toMatchObject({
      name: '보행 Dataset v2',
      episodeIds: ['episode-2'],
      updatedAtMs: 200,
    });
    await expect(repository.getDataset(created.id)).resolves.toEqual(updated);
  });

  it('이름 또는 Episode 구성이 비어 있으면 저장하지 않는다', async () => {
    const repository = new InMemoryDatasetRepository([]);

    await expect(repository.createDataset({
      name: ' ',
      description: '',
      tags: [],
      episodeIds: ['episode-1'],
    })).rejects.toThrow('이름');
    await expect(repository.createDataset({
      name: 'Dataset',
      description: '',
      tags: [],
      episodeIds: [],
    })).rejects.toThrow('에피소드');
    await expect(repository.listDatasets()).resolves.toHaveLength(0);
  });

  it('태그 필터·정렬·페이지를 같은 결과 집합에 적용하고 동률은 ID로 고정한다', async () => {
    const repository = new InMemoryDatasetRepository([
      {
        id: 'dataset-b',
        name: '공통 이름',
        description: '두 번째',
        tags: ['indoor'],
        episodeIds: ['episode-1'],
        status: 'draft',
        createdAtMs: 100,
        updatedAtMs: 300,
      },
      {
        id: 'dataset-a',
        name: '공통 이름',
        description: '첫 번째',
        tags: ['indoor', 'verified'],
        episodeIds: ['episode-1', 'episode-2'],
        status: 'draft',
        createdAtMs: 200,
        updatedAtMs: 300,
      },
      {
        id: 'dataset-c',
        name: '외부 데이터',
        description: '필터 제외',
        tags: ['outdoor'],
        episodeIds: ['episode-3'],
        status: 'draft',
        createdAtMs: 400,
        updatedAtMs: 400,
      },
    ]);

    const baseQuery = {
      search: '',
      tag: 'indoor',
      sort: 'updated-desc' as const,
      pageSize: 1,
    };
    const firstPage = await repository.queryDatasets({ ...baseQuery, page: 1 });
    const secondPage = await repository.queryDatasets({ ...baseQuery, page: 2 });

    expect(firstPage).toMatchObject({ totalItems: 2, totalPages: 2, page: 1 });
    expect(firstPage.items.map((dataset) => dataset.id)).toEqual(['dataset-a']);
    expect(secondPage.items.map((dataset) => dataset.id)).toEqual(['dataset-b']);

    const byEpisodeCount = await repository.queryDatasets({
      ...baseQuery,
      page: 1,
      pageSize: 20,
      sort: 'episodes-desc',
    });
    expect(byEpisodeCount.items[0]?.id).toBe('dataset-a');
  });

  it('초기 데이터와 충돌하지 않는 내부 ID를 생성한다', async () => {
    const repository = new InMemoryDatasetRepository([
      {
        id: 'dataset-011',
        name: '기존 초안',
        description: '',
        tags: [],
        episodeIds: ['episode-existing'],
        status: 'draft',
        createdAtMs: 100,
        updatedAtMs: 100,
      },
    ], () => 200);

    const created = await repository.createDataset({
      name: '신규 초안',
      description: '',
      tags: [],
      episodeIds: ['episode-new'],
    });

    expect(created.id).toBe('dataset-012');
    await expect(repository.listDatasets()).resolves.toHaveLength(2);
  });
});
