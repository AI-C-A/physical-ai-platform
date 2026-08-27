import type { Dataset } from './dataset';

const STATUS_LABELS = {
  draft: '초안',
} satisfies Record<Dataset['status'], string>;

export function getDatasetStatusLabel(value: Dataset['status']): string {
  return STATUS_LABELS[value];
}
