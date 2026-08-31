import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel } from './in-memory-flywheel';

describe('InMemoryFlywheel', () => {
  afterEach(() => vi.useRealTimers());

  it('하나의 휴머노이드 세션에서 Episode를 순차 생성하고 동시 기록을 막는다', async () => {
    let now = 1_800_000_000_000;
    const port = createInMemoryFlywheel({ nowMs: () => now });
    const session = await port.createHumanoidSession({
      projectId: 'project-tiger',
      siteId: 'site-lab',
      name: 'multi episode',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      taskId: 'task-sort',
      instruction: 'Sort objects',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const first = await port.startEpisode(session.id, 'Episode 1');
    await expect(port.startEpisode(session.id, 'Episode 2')).rejects.toThrow('동시에 둘 이상');
    now += 42_000;
    await port.completeEpisode(first.id, 'success');
    const second = await port.startEpisode(session.id, 'Episode 2');
    now += 35_000;
    await port.completeEpisode(second.id, 'failure');
    const completed = await port.stopSession(session.id);

    expect(completed.kind).toBe('humanoid');
    if (completed.kind !== 'humanoid') throw new Error('expected humanoid');
    expect(completed.episodeIds).toEqual([first.id, second.id]);
    expect(completed.activeEpisodeId).toBeNull();
    port.dispose();
  });

  it('자율→Teleop 전환에서 Intervention을 자동 생성하고 자율 복귀 시 닫는다', async () => {
    let now = 1_800_000_000_000;
    const port = createInMemoryFlywheel({ nowMs: () => now });
    const session = await port.createMobilitySession({
      projectId: 'project-tiger',
      siteId: 'site-pangyo',
      name: 'route test',
      robotId: 'robot-002',
      sensorDeviceId: 'sensor-rig-002',
      routeId: 'route-a',
      preBufferMs: 10_000,
      postBufferMs: 20_000,
    });
    await port.validateSession(session.id);
    const started = await port.startSession(session.id);
    now += 30_000;
    await port.setMobilityControlMode(session.id, 'teleop');
    const detected = (await port.listInterventions()).find((item) => item.driveSessionId === (started.kind === 'mobility' ? started.driveSessionId : ''));
    expect(detected?.startMs).toBe(1_800_000_020_000);
    now += 8_000;
    await port.setMobilityControlMode(session.id, 'autonomous');
    const reviewed = await port.getIntervention(detected?.id ?? '');
    expect(reviewed?.controlReturnedAtMs).toBe(now);
    expect(reviewed?.endMs).toBe(now + 20_000);
    expect(reviewed?.status).toBe('needs-review');
    port.dispose();
  });

  it('Dataset kind 혼합과 미검증 Model의 Production 승격을 거절한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    await expect(port.createDataset({
      projectId: 'project-tiger',
      name: 'invalid mixed dataset',
      description: '',
      kind: 'humanoid-episode',
      tags: [],
      unitRefs: [{ kind: 'drive-window', driveSessionId: 'drive-001', startMs: 0, endMs: 1_000 }],
    })).rejects.toThrow('혼합할 수 없습니다');

    const released = (await port.listDatasets()).find((item) => item.status === 'released');
    if (released === undefined) throw new Error('released dataset fixture missing');
    vi.useFakeTimers();
    const run = await port.createTrainingRun({
      projectId: 'project-tiger',
      name: 'gate test',
      datasetVersionId: released.id,
      modelFamily: 'act',
      computeResourceIds: ['gpu-0'],
      batchSize: 2,
      steps: 100,
      learningRate: 0.000025,
    });
    await vi.advanceTimersByTimeAsync(2_100);
    const succeeded = await port.getTrainingRun(run.id);
    const modelId = succeeded?.modelVersionId;
    expect(modelId).not.toBeNull();
    await expect(port.updateModelStage(modelId ?? '', 'production')).rejects.toThrow('통과한 Evaluation');
    port.dispose();
  });

  it('dispose 이후 예약된 Training 상태 갱신을 중단한다', async () => {
    vi.useFakeTimers();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const run = await port.createTrainingRun({
      projectId: 'project-tiger', name: 'dispose test', datasetVersionId: 'dataset-h-v3', modelFamily: 'pi0',
      computeResourceIds: ['gpu-0'], batchSize: 2, steps: 100, learningRate: 0.000025,
    });
    port.dispose();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(port.getTrainingRun(run.id)).resolves.toMatchObject({ status: 'queued' });
  });
});
