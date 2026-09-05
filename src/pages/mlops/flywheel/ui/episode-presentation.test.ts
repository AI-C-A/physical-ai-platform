import { describe, expect, it } from 'vitest';

import { createInMemoryFlywheel } from '@/entities/flywheel';

import { getEpisodeStorageLabel, getEpisodeTimelineMarkers } from './episode-presentation';

describe('에피소드 기록 표시', () => {
  it('실패한 작업의 기록도 저장 상태와 구분해 표시한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const episode = await port.getEpisode('episode-fw-001');
      if (episode === null) throw new Error('기록 없음');
      expect(getEpisodeStorageLabel({ ...episode, status: 'completed', outcome: 'failure' })).toBe('저장됨');
      expect(getEpisodeStorageLabel({ ...episode, status: 'invalid' })).toBe('제외됨');
      expect(getEpisodeStorageLabel({ ...episode, status: 'recording' })).toBe('녹화 중');
    } finally {
      port.dispose();
    }
  });

  it('이벤트를 실제 시각순으로 배치하고 기록 범위 밖 위치를 제한한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const episode = await port.getEpisode('episode-fw-001');
      if (episode === null) throw new Error('기록 없음');
      const record = { ...episode, startedAtMs: 1000, endedAtMs: 2000, events: [
        { id: 'late', type: 'release' as const, label: '놓기', occurredAtMs: 2400 },
        { id: 'grasp', type: 'grasp' as const, label: '집기', occurredAtMs: 1250 },
      ] };
      expect(getEpisodeTimelineMarkers(record).map(({ id, offsetPercent }) => ({ id, offsetPercent }))).toEqual([
        { id: 'grasp', offsetPercent: 25 }, { id: 'late', offsetPercent: 100 },
      ]);
      expect(getEpisodeTimelineMarkers({ ...record, endedAtMs: 1000 }).every((marker) => marker.offsetPercent === 0)).toBe(true);
    } finally {
      port.dispose();
    }
  });
});
