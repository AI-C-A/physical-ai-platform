import { describe, expect, it } from 'vitest';

import type { CreateDatasetVersionInput } from '../model/flywheel';
import { createInMemoryFlywheel } from './in-memory-flywheel';

const base: CreateDatasetVersionInput = {
  projectId: 'project-tiger', name: '수집 데이터', description: '', tags: [],
  kind: 'humanoid-episode', unitRefs: [{ kind: 'episode', episodeId: 'episode-fw-001' }],
};

describe('데이터셋 참조 검증', () => {
  it.each<CreateDatasetVersionInput>([
    { ...base, unitRefs: [{ kind: 'episode', episodeId: 'missing' }] },
    { ...base, kind: 'drive-window', unitRefs: [{ kind: 'drive-window', driveSessionId: 'missing', startMs: 0, endMs: 1_000 }] },
    { ...base, kind: 'intervention-window', unitRefs: [{ kind: 'intervention-window', interventionId: 'missing', preMs: 0, postMs: 1_000 }] },
  ])('없는 $kind 참조로 초안을 생성하지 않는다', async (input) => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const before = await port.listDatasets();
      await expect(port.createDataset(input)).rejects.toThrow('찾을 수 없습니다');
      expect(await port.listDatasets()).toEqual(before);
    } finally { port.dispose(); }
  });

  it('다른 프로젝트 데이터와 저장된 주행 범위 밖의 구간을 거절한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      await expect(port.createDataset({ ...base, projectId: 'project-logistics' })).rejects.toThrow('다른 프로젝트');
      for (const [startMs, endMs] of [[-1, 1_000], [1_000, 500], [0, 3_600_001], [0, Number.NaN]]) {
        await expect(port.createDataset({ ...base, kind: 'drive-window', unitRefs: [{ kind: 'drive-window', driveSessionId: 'drive-001', startMs: startMs!, endMs: endMs! }] })).rejects.toThrow('저장된 주행 시간');
      }
    } finally { port.dispose(); }
  });

  it('녹화 중인 에피소드는 거절하고 저장 후 데이터셋이 참조하면 세션 삭제에도 보존한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await port.createHumanoidSession({
        projectId: 'project-tiger', siteId: 'site-lab', name: '데이터셋 원본', robotId: 'robot-003',
        sensorDeviceId: 'sensor-rig-001', taskId: 'task-sort', instruction: '분류 작업',
      });
      await port.validateSession(session.id);
      await port.startSession(session.id);
      const episode = await port.startEpisode(session.id);
      const input: CreateDatasetVersionInput = { ...base, unitRefs: [{ kind: 'episode', episodeId: episode.id }] };
      await expect(port.createDataset(input)).rejects.toThrow('저장이 완료된 에피소드');
      await port.completeEpisode(episode.id, 'success');
      const dataset = await port.createDataset(input);
      await port.deleteOperationalSession(session.id);
      expect(await port.getEpisode(episode.id)).toMatchObject({ id: episode.id, status: 'completed' });
      expect(await port.releaseDataset(dataset.id)).toMatchObject({ status: 'released' });
    } finally { port.dispose(); }
  });

  it('저장된 실패 사례도 임의 품질 정책을 추가하지 않고 데이터셋에 포함한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const dataset = await port.createDataset({ ...base, unitRefs: [{ kind: 'episode', episodeId: 'episode-fw-002' }] });
      expect(await port.releaseDataset(dataset.id)).toMatchObject({ status: 'released' });
    } finally { port.dispose(); }
  });
});
