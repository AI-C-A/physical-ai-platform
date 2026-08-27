import type { CreateDatasetInput, Dataset, UpdateDatasetInput } from './dataset';
import type { PageRequest, PageResult } from '@/shared/lib/query';

export interface DatasetQuery extends PageRequest {
  readonly search: string;
  readonly tag: string | null;
  readonly sort: 'updated-desc' | 'updated-asc' | 'name-asc' | 'episodes-desc';
}

export interface DatasetRepositoryPort {
  listDatasets(): Promise<readonly Dataset[]>;
  queryDatasets(query: DatasetQuery): Promise<PageResult<Dataset>>;
  getDataset(datasetId: string): Promise<Dataset | null>;
  createDataset(input: CreateDatasetInput): Promise<Dataset>;
  updateDataset(input: UpdateDatasetInput): Promise<Dataset>;
  subscribe(listener: () => void): () => void;
}
