import type { ClockPort } from '@/shared/lib/clock';

import type { Dataset } from '../model/dataset';
import { InMemoryDatasetRepository } from './in-memory-dataset-repository';

export function createInMemoryDatasetRepository(clock: ClockPort): InMemoryDatasetRepository {
  const anchorMs = clock.nowMs();
  const datasets: readonly Dataset[] = Array.from({ length: 5 }, (_, index) => ({
    id: `dataset-${String(index + 1).padStart(3, '0')}`,
    name: `학습 데이터셋 초안 ${String(index + 1).padStart(2, '0')}`,
    description: '선택한 에피소드로 구성한 초안 데이터셋입니다.',
    tags: [index % 2 === 0 ? '주행' : '점검', index % 3 === 0 ? '실환경' : '검토'],
    episodeIds: [`episode-${String(index * 3 + 1).padStart(3, '0')}`, `episode-${String(index * 3 + 2).padStart(3, '0')}`],
    status: 'draft',
    createdAtMs: anchorMs - index * 24 * 60 * 60 * 1000,
    updatedAtMs: anchorMs - index * 20 * 60 * 60 * 1000,
  }));
  return new InMemoryDatasetRepository(datasets, () => clock.nowMs());
}
