import { createContext, useCallback, useContext } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';
import type { PageResult } from '@/shared/lib/query';

import type { Dataset } from './dataset';
import type { DatasetQuery, DatasetRepositoryPort } from './dataset-repository';

export const DatasetRepositoryContext = createContext<DatasetRepositoryPort | null>(null);

export function useDatasetRepository(): DatasetRepositoryPort {
  const repository = useContext(DatasetRepositoryContext);
  if (repository === null) throw new Error('DatasetRepositoryProvider가 필요합니다.');
  return repository;
}

export function useDatasetQuery(query: DatasetQuery): AsyncQueryState<PageResult<Dataset>> {
  const repository = useDatasetRepository();
  const load = useCallback(() => repository.queryDatasets(query), [query, repository]);
  const subscribe = useCallback((listener: () => void) => repository.subscribe(listener), [repository]);
  return useAsyncQuery(load, subscribe, { retainPreviousData: true });
}

export function useDataset(datasetId: string): AsyncQueryState<Dataset | null> {
  const repository = useDatasetRepository();
  const load = useCallback(() => repository.getDataset(datasetId), [datasetId, repository]);
  const subscribe = useCallback((listener: () => void) => repository.subscribe(listener), [repository]);
  return useAsyncQuery(load, subscribe);
}
