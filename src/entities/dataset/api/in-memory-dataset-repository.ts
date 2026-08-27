import { createStore, type StoreApi } from 'zustand/vanilla';
import { createPageResult } from '@/shared/lib/query';

import type { CreateDatasetInput, Dataset, UpdateDatasetInput } from '../model/dataset';
import type { DatasetQuery, DatasetRepositoryPort } from '../model/dataset-repository';

interface DatasetState { readonly datasets: readonly Dataset[] }

export class InMemoryDatasetRepository implements DatasetRepositoryPort {
  readonly #store: StoreApi<DatasetState>;
  readonly #now: () => number;
  #sequence = 10;

  constructor(initialDatasets: readonly Dataset[], now: () => number = Date.now) {
    this.#store = createStore(() => ({ datasets: initialDatasets }));
    this.#now = now;
  }

  listDatasets(): Promise<readonly Dataset[]> { return Promise.resolve(this.#datasets()); }

  queryDatasets(query: DatasetQuery) {
    const search = query.search.trim().toLocaleLowerCase();
    const filtered = this.#datasets().filter(
      (dataset) =>
        (dataset.name.toLocaleLowerCase().includes(search)
          || dataset.id.toLocaleLowerCase().includes(search)
          || dataset.description.toLocaleLowerCase().includes(search)
          || dataset.tags.some((tag) => tag.toLocaleLowerCase().includes(search))) &&
        (query.tag === null || dataset.tags.includes(query.tag)),
    );
    const sorted = [...filtered].sort((left, right) => {
      const primary = query.sort === 'updated-asc'
        ? left.updatedAtMs - right.updatedAtMs
        : query.sort === 'name-asc'
          ? left.name.localeCompare(right.name, 'ko')
          : query.sort === 'episodes-desc'
            ? right.episodeIds.length - left.episodeIds.length
            : right.updatedAtMs - left.updatedAtMs;
      return primary === 0 ? left.id.localeCompare(right.id) : primary;
    });
    return Promise.resolve(createPageResult(sorted, query));
  }

  getDataset(datasetId: string): Promise<Dataset | null> {
    return Promise.resolve(this.#findDataset(datasetId));
  }

  async createDataset(input: CreateDatasetInput): Promise<Dataset> {
    await Promise.resolve();
    this.#assertInput(input);
    const nowMs = this.#now();
    const dataset: Dataset = {
      ...input,
      id: this.#nextId(),
      status: 'draft',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    this.#store.setState((state) => ({ datasets: [dataset, ...state.datasets] }));
    return dataset;
  }

  async updateDataset(input: UpdateDatasetInput): Promise<Dataset> {
    await Promise.resolve();
    this.#assertInput(input);
    const current = this.#findDataset(input.id);
    if (current === null) throw new Error(`데이터셋을 찾을 수 없습니다: ${input.id}`);
    const updated: Dataset = { ...current, ...input, updatedAtMs: this.#now() };
    this.#store.setState((state) => ({
      datasets: state.datasets.map((dataset) => dataset.id === input.id ? updated : dataset),
    }));
    return updated;
  }

  subscribe(listener: () => void): () => void { return this.#store.subscribe(listener); }

  #assertInput(input: CreateDatasetInput): void {
    if (input.name.trim().length === 0) throw new Error('데이터셋 이름을 입력해야 합니다.');
    if (input.episodeIds.length === 0) throw new Error('에피소드를 하나 이상 선택해야 합니다.');
  }

  #datasets(): readonly Dataset[] { return this.#store.getState().datasets; }

  #nextId(): string {
    let candidate: string;
    do {
      this.#sequence += 1;
      candidate = `dataset-${String(this.#sequence).padStart(3, '0')}`;
    } while (this.#findDataset(candidate) !== null);
    return candidate;
  }

  #findDataset(datasetId: string): Dataset | null {
    return this.#datasets().find((dataset) => dataset.id === datasetId) ?? null;
  }
}
