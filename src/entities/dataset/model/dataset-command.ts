import { useCallback } from 'react';

import {
  useCoordinatedCommand,
  type CoordinatedCommandResetOptions,
  type CoordinatedCommandSnapshot,
} from '@/shared/lib/command-coordinator';

import type { CreateDatasetInput, Dataset, UpdateDatasetInput } from './dataset';
import { useDatasetRepository } from './dataset-context';

interface DatasetCommand<TInput> {
  readonly snapshot: CoordinatedCommandSnapshot<Dataset, TInput>;
  readonly clearLastSuccess: () => void;
  readonly execute: (input: TInput) => Promise<Dataset>;
  readonly reset: (options?: CoordinatedCommandResetOptions) => void;
}

export function useCreateDatasetCommand(
  initialEpisodeId: string | null,
): DatasetCommand<CreateDatasetInput> {
  const repository = useDatasetRepository();
  const commandKey = `create:${JSON.stringify(initialEpisodeId)}`;
  const command = useCoordinatedCommand<Dataset, CreateDatasetInput>(
    repository,
    commandKey,
  );
  const coordinate = command.execute;
  const execute = useCallback(
    (input: CreateDatasetInput) => coordinate(
      input,
      () => repository.createDataset(input),
    ),
    [coordinate, repository],
  );
  return {
    snapshot: command.snapshot,
    clearLastSuccess: command.clearLastSuccess,
    execute,
    reset: command.reset,
  };
}

export function useUpdateDatasetCommand(
  datasetId: string,
): DatasetCommand<Omit<UpdateDatasetInput, 'id'>> {
  const repository = useDatasetRepository();
  const command = useCoordinatedCommand<
    Dataset,
    Omit<UpdateDatasetInput, 'id'>
  >(repository, `update:${datasetId}`);
  const coordinate = command.execute;
  const execute = useCallback(
    (input: Omit<UpdateDatasetInput, 'id'>) => coordinate(
      input,
      () => repository.updateDataset({ ...input, id: datasetId }),
    ),
    [coordinate, datasetId, repository],
  );
  return {
    snapshot: command.snapshot,
    clearLastSuccess: command.clearLastSuccess,
    execute,
    reset: command.reset,
  };
}
