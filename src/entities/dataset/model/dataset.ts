export interface Dataset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly episodeIds: readonly string[];
  readonly status: 'draft';
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface CreateDatasetInput {
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly episodeIds: readonly string[];
}

export interface UpdateDatasetInput extends CreateDatasetInput {
  readonly id: string;
}
