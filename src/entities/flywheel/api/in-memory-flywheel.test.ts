import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInMemoryFlywheel,
  InMemoryFlywheel,
  type InMemoryFlywheelSyncTransport,
} from './in-memory-flywheel';

class InProcessSyncBus {
  readonly #listeners = new Map<string, Set<(message: string) => void>>();

  createTransport(clientId: string): InMemoryFlywheelSyncTransport {
    return {
      clientId,
      send: (message) => this.#listeners.forEach((listeners) => {
        listeners.forEach((listener) => listener(message));
      }),
      subscribe: (listener) => {
        const listeners = this.#listeners.get(clientId) ?? new Set();
        listeners.add(listener);
        this.#listeners.set(clientId, listeners);
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) this.#listeners.delete(clientId);
        };
      },
    };
  }
}

describe('InMemoryFlywheel', () => {
  afterEach(() => vi.useRealTimers());

  it('만료 경계에서 연결을 거절하고 새 코드를 Quest에 동기화하며 세션을 보존한다', async () => {
    let now = 1_800_000_000_000;
    const clock = { nowMs: () => now };
    const bus = new InProcessSyncBus();
    const pc = createInMemoryFlywheel(clock, { syncTransport: bus.createTransport('pc') });
    const quest = createInMemoryFlywheel(clock, { syncTransport: bus.createTransport('quest') });
    try {
      const session = await pc.createHumanDemonstrationSession({
        projectId: 'project-tiger', siteId: 'site-lab', name: '연결 복구',
        taskId: 'task-sort', instruction: 'Sort objects',
        exoskeletonDeviceId: 'exo-1', questDeviceId: 'quest-1',
        headCameraDeviceId: 'head-1', externalCameraDeviceId: '',
      });
      const oldCode = session.humanDemonstration!.pairing.code;
      const input = { pairingCode: oldCode, sourceDeviceId: 'quest-1', integrationProfileId: 'quest-webxr-hand-pose-v1', capabilities: ['left-hand-pose', 'right-hand-pose'] };
      now += 30 * 60_000;
      await expect(quest.pairHumanDemonstrationSource(input)).rejects.toThrow('새 코드 받기');
      const updated = await pc.renewHumanDemonstrationPairing(session.id);
      expect(updated.humanDemonstration!.pairing.code).not.toBe(oldCode);
      expect(updated.humanDemonstration!.pairing.expiresAtMs).toBe(now + 30 * 60_000);
      expect({ ...updated, updatedAtMs: session.updatedAtMs, humanDemonstration: { ...updated.humanDemonstration, pairing: session.humanDemonstration!.pairing } }).toEqual(session);
      expect(await quest.getSession(session.id)).toMatchObject({ humanDemonstration: { pairing: updated.humanDemonstration!.pairing } });
      await expect(quest.pairHumanDemonstrationSource(input)).rejects.toThrow();
      await expect(quest.pairHumanDemonstrationSource({ ...input, pairingCode: updated.humanDemonstration!.pairing.code })).resolves.toMatchObject({ sessionId: session.id });
      await expect(pc.renewHumanDemonstrationPairing(session.id)).rejects.toThrow('이미 연결');
      await quest.updateHumanDemonstrationSource(session.id, 'quest-1', 'ready');
      await pc.validateSession(session.id);
      await pc.startSession(session.id);
      await quest.updateHumanDemonstrationSource(session.id, 'quest-1', 'offline');
      const reconnect = await pc.renewHumanDemonstrationPairing(session.id);
      expect(reconnect.status).toBe('active');
      await expect(pc.startEpisode(session.id)).rejects.toThrow('필수 source 연결');
      await expect(quest.pairHumanDemonstrationSource({ ...input, pairingCode: reconnect.humanDemonstration!.pairing.code })).resolves.toMatchObject({ sessionId: session.id });
    } finally { pc.dispose(); quest.dispose(); }
  });

  it('versioned Mock realtime transport로 독립 adapter의 Session과 pairing 상태를 교환한다', async () => {
    const clock = { nowMs: () => 1_800_000_000_000 };
    const bus = new InProcessSyncBus();
    const pc = createInMemoryFlywheel(clock, { syncTransport: bus.createTransport('pc') });
    const session = await pc.createHumanDemonstrationSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'realtime mock',
      taskId: 'task-sort', instruction: 'Sort objects',
      exoskeletonDeviceId: 'exoskeleton-001', questDeviceId: 'quest2-001',
      headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: 'external-camera-001',
    });
    if (session.humanDemonstration === null) throw new Error('Human Demonstration binding이 필요합니다.');

    const questTransport = bus.createTransport('quest');
    const quest = createInMemoryFlywheel(clock, { syncTransport: questTransport });
    expect(await quest.getSession(session.id)).toMatchObject({ id: session.id, status: 'draft' });

    await quest.pairHumanDemonstrationSource({
      pairingCode: session.humanDemonstration.pairing.code,
      sourceDeviceId: 'quest2-001',
      integrationProfileId: 'quest-webxr-hand-pose-v1',
      capabilities: ['left-hand-pose', 'right-hand-pose'],
    });
    const synchronizedSession = await pc.getSession(session.id);
    expect(synchronizedSession?.kind === 'humanoid'
      ? synchronizedSession.humanDemonstration?.sourceBindings.find(
        (source) => source.sourceDeviceId === 'quest2-001',
      )
      : null).toMatchObject({ sourceDeviceId: 'quest2-001', state: 'paired' });

    questTransport.send(JSON.stringify({ schemaVersion: 99, type: 'state-snapshot' }));
    expect(await pc.getSession(session.id)).toMatchObject({ id: session.id });
    quest.dispose();
    pc.dispose();
  });

  it('Quest의 늦은 정지 응답은 PC가 확정한 Episode를 파일 확정 중으로 되돌리지 않는다', async () => {
    vi.useFakeTimers();
    const clock = { nowMs: () => Date.now() };
    const bus = new InProcessSyncBus();
    const pcTransport = bus.createTransport('pc');
    const delayedMessages: string[] = [];
    let delayPcMessages = false;
    const pc = createInMemoryFlywheel(clock, { syncTransport: {
      ...pcTransport,
      send: (message) => { if (delayPcMessages) delayedMessages.push(message); else pcTransport.send(message); },
    } });
    const quest = createInMemoryFlywheel(clock, { syncTransport: bus.createTransport('quest') });
    try {
      const session = await pc.createHumanDemonstrationSession({
        projectId: 'project-tiger', siteId: 'site-lab', name: '지연된 장치 응답',
        taskId: 'task-sort', instruction: '분류', exoskeletonDeviceId: 'exoskeleton-001',
        questDeviceId: 'quest2-001', headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: '',
      });
      await quest.updateHumanDemonstrationSource(session.id, 'quest2-001', 'ready');
      await pc.validateSession(session.id);
      await pc.startSession(session.id);
      const episode = await pc.startEpisode(session.id);
      await pc.stopEpisode(episode.id);
      delayPcMessages = true;
      await vi.advanceTimersByTimeAsync(250);
      expect(await pc.getEpisode(episode.id)).toMatchObject({ status: 'completed' });
      expect(await quest.getEpisode(episode.id)).toMatchObject({ status: 'finalizing' });
      const handPose = {
        coordinateFrame: 'quest-local-floor' as const, deviceTimestampMs: 1,
        receivedTimestampMs: clock.nowMs(),
        hands: {
          left: { sourcePresent: false, poseObserved: false, joints: [] },
          right: { sourcePresent: false, poseObserved: false, joints: [] },
        },
      };
      const frame = { ...handPose, sequence: 0, frameEpoch: 1, episodeOffsetMs: 0 };
      await quest.reportHandPoseBatch({
        sessionId: session.id, episodeId: episode.id, sourceDeviceId: 'quest2-001',
        firstSequence: 0, lastSequence: 0, frameCount: 1, byteLength: 128,
        deviceTimestampMs: handPose.deviceTimestampMs, receivedTimestampMs: handPose.receivedTimestampMs,
        leftPoseObserved: false, rightPoseObserved: false, leftSourcePresent: false, rightSourcePresent: false,
        latestHandPose: handPose, frames: [frame],
      });
      await quest.acknowledgeCollectorCommand({
        sessionId: session.id, episodeId: episode.id, sourceDeviceId: 'quest2-001',
        command: 'stop', state: 'acknowledged', acknowledgedAtMs: clock.nowMs(), detail: null,
      });
      await quest.updateHumanDemonstrationSource(session.id, 'quest2-001', 'ready');
      delayPcMessages = false;
      delayedMessages.splice(0).forEach((message) => pcTransport.send(message));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pc.getEpisode(episode.id)).toMatchObject({ status: 'completed', finalizationError: null });
      expect(await pc.getEpisodeHandPoseAt(episode.id, 0)).toEqual(frame);
      delayPcMessages = true;
      await expect(pc.saveEpisode(episode.id)).resolves.toMatchObject({ id: episode.id });
      await quest.updateHumanDemonstrationSource(session.id, 'quest2-001', 'ready');
      expect(await pc.getSession(session.id)).toMatchObject({ activeEpisodeId: null });
      expect(await pc.getEpisode(episode.id)).toMatchObject({ status: 'completed' });
      expect(await pc.getEpisodeHandPoseAt(episode.id, 0)).toEqual(frame);
      delayPcMessages = false;
      delayedMessages.splice(0).forEach((message) => pcTransport.send(message));
      const nextEpisode = await pc.startEpisode(session.id);
      await quest.updateHumanDemonstrationSource(session.id, 'quest2-001', 'recording');
      expect(await pc.getSession(session.id)).toMatchObject({ activeEpisodeId: nextEpisode.id });
      expect(await quest.getSession(session.id)).toMatchObject({ activeEpisodeId: nextEpisode.id });
      expect(await pc.getEpisode(nextEpisode.id)).toMatchObject({ status: 'recording' });
      expect(await quest.getEpisode(episode.id)).toMatchObject({ status: 'completed' });
    } finally {
      pc.dispose();
      quest.dispose();
    }
  });

  it('선택 외부 카메라가 비어 있으면 장치와 관측률을 만들지 않는다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await port.createHumanDemonstrationSession({
        projectId: 'project-tiger', siteId: 'site-lab', name: '외부 카메라 없는 수집',
        taskId: 'task-sort', instruction: '분류',
        exoskeletonDeviceId: 'exoskeleton-001', questDeviceId: 'quest2-001',
        headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: '',
      });
      expect(session.humanDemonstration?.sourceBindings).toHaveLength(3);
      expect(session.humanDemonstration?.sourceBindings.some((source) => source.role === 'external-scene-camera')).toBe(false);
      expect(session.streams.find((stream) => stream.id === 'external-fullbody-rgb')).toMatchObject({ sourceDeviceId: null, observedRateHz: null });
    } finally {
      port.dispose();
    }
  });

  it('Human Demonstration에서 participant와 source를 분리하고 derived artifact를 sensor로 위장하지 않는다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanDemonstrationSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'human demo',
      taskId: 'task-sort', instruction: 'Sort objects',
      exoskeletonDeviceId: 'exoskeleton-001', questDeviceId: 'quest2-001',
      headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: 'external-camera-001',
    });
    if (session.humanDemonstration === null) throw new Error('Human Demonstration binding이 필요합니다.');

    expect(session).toMatchObject({
      robotId: null,
      robotType: null,
      sensorDeviceId: null,
      provenance: { environment: 'simulation', dataOrigin: 'synthetic' },
    });
    expect(session.humanDemonstration).toMatchObject({
      participantIdScope: 'session',
      exoskeletonDeviceId: 'exoskeleton-001',
      profile: { schemaVersion: 1 },
    });
    expect(new Set(session.humanDemonstration.sourceBindings.map((source) => source.sourceDeviceId)).size).toBe(4);
    expect(session.humanDemonstration.participantId).not.toBe('exoskeleton-001');
    expect(session.streams.find((stream) => stream.id === 'head-depth-estimated')).toMatchObject({
      origin: 'derived', processingStatus: 'pending', sourceDeviceId: null,
    });
    expect(session.streams.some((stream) => stream.sourceDeviceId === 'quest2-001' && stream.id.includes('rgb'))).toBe(false);
    expect(session.streams.some((stream) => stream.id.includes('sensor-depth'))).toBe(false);

    await expect(port.validateSession(session.id)).rejects.toThrow('필수 장치 연결 대기 중');
    await expect(port.pairHumanDemonstrationSource({
      pairingCode: session.humanDemonstration.pairing.code,
      sourceDeviceId: 'quest2-001',
      integrationProfileId: 'quest-webxr-hand-pose-v1',
      capabilities: ['left-hand-pose'],
    })).rejects.toThrow('capability');
    const pairing = await port.pairHumanDemonstrationSource({
      pairingCode: session.humanDemonstration.pairing.code,
      sourceDeviceId: 'quest2-001',
      integrationProfileId: 'quest-webxr-hand-pose-v1',
      capabilities: ['left-hand-pose', 'right-hand-pose'],
    });
    expect(pairing).toMatchObject({ sessionId: session.id, sourceDeviceId: 'quest2-001' });
    expect(pairing.participantId).toBe(session.humanDemonstration.participantId);
    expect(await port.getCollectionTelemetry(session.id)).toMatchObject({
      activeEpisodeId: null,
      connectionState: 'offline',
      completenessPercent: 0,
      qualityVerdict: 'not-ready',
    });
    await expect(port.validateSession(session.id)).rejects.toThrow('필수 장치 연결 대기 중');
    await port.updateHumanDemonstrationSource(pairing.sessionId, pairing.sourceDeviceId, 'ready');
    expect(await port.getCollectionTelemetry(session.id)).toMatchObject({
      activeEpisodeId: null,
      connectionState: 'live',
      completenessPercent: 0,
      qualityVerdict: 'not-ready',
    });
    port.dispose();
  });

  it('필수 Collector가 회복되면 과거 연결 오류를 현재 상태에서 제거한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanDemonstrationSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'collector recovery',
      taskId: 'task-sort', instruction: 'Sort objects',
      exoskeletonDeviceId: 'exoskeleton-001', questDeviceId: 'quest2-001',
      headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: 'external-camera-001',
    });
    if (session.humanDemonstration === null) throw new Error('Human Demonstration binding이 필요합니다.');
    await port.pairHumanDemonstrationSource({
      pairingCode: session.humanDemonstration.pairing.code,
      sourceDeviceId: 'quest2-001',
      integrationProfileId: 'quest-webxr-hand-pose-v1',
      capabilities: ['left-hand-pose', 'right-hand-pose'],
    });
    await port.updateHumanDemonstrationSource(session.id, 'quest2-001', 'ready');
    await port.validateSession(session.id);
    await port.startSession(session.id);
    await port.startEpisode(session.id);

    const failed = await port.reportStreamFailure(session.id, 'quest-hand-left', true);
    expect(failed.errorMessage).toMatch(/필수 source 연결/u);
    const recovered = await port.updateHumanDemonstrationSource(session.id, 'quest2-001', 'ready');
    expect(recovered.errorMessage).toBeNull();
    port.dispose();
  });

  it('하나의 휴머노이드 세션에서 Episode를 순차 생성하고 중복 요청을 멱등 처리한다', async () => {
    vi.useFakeTimers();
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
    const duplicateStart = await port.startEpisode(session.id, 'Episode 2');
    expect(duplicateStart.id).toBe(first.id);
    now += 42_000;
    const stopped = await port.stopEpisode(first.id);
    const duplicateStop = await port.stopEpisode(first.id);
    expect(stopped.status).toBe('finalizing');
    expect(duplicateStop.id).toBe(first.id);
    await vi.advanceTimersByTimeAsync(250);
    expect(await port.getEpisode(first.id)).toMatchObject({ status: 'completed', outcome: null });
    expect(await port.getSession(session.id)).toMatchObject({ activeEpisodeId: first.id });
    await expect(port.stopSession(session.id)).rejects.toThrow('저장하거나 폐기');
    await port.saveEpisode(first.id);
    expect(await port.getSession(session.id)).toMatchObject({ activeEpisodeId: null });
    const second = await port.startEpisode(session.id, 'Episode 2');
    now += 35_000;
    await port.stopEpisode(second.id);
    await vi.advanceTimersByTimeAsync(250);
    await port.saveEpisode(second.id);
    const completed = await port.stopSession(session.id);

    expect(completed.kind).toBe('humanoid');
    if (completed.kind !== 'humanoid') throw new Error('expected humanoid');
    expect(completed.episodeIds).toEqual([first.id, second.id]);
    expect(completed.activeEpisodeId).toBeNull();
    expect(completed.status).toBe('processing');
    await vi.advanceTimersByTimeAsync(500);
    expect((await port.listOperationalSessions()).some((item) => item.id === session.id)).toBe(false);
    expect(await port.getCatalogCollection(session.id)).toMatchObject({ id: session.id });
    port.dispose();
  });

  it('같은 로봇의 active 세션만 충돌시키고 서로 다른 로봇은 동시에 시작한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = (name: string, robotId: string) => port.createHumanoidSession({
      projectId: 'project-tiger',
      siteId: 'site-lab',
      name,
      robotId,
      sensorDeviceId: 'sensor-rig-001',
      taskId: 'task-sort',
      instruction: 'Sort objects',
    });
    const first = await create('robot 1 active', 'robot-001');
    const sameRobot = await create('robot 1 ready', 'robot-001');
    const otherRobot = await create('robot 3 active', 'robot-003');
    await Promise.all([
      port.validateSession(first.id),
      port.validateSession(sameRobot.id),
      port.validateSession(otherRobot.id),
    ]);
    await port.startSession(first.id);
    await port.startSession(otherRobot.id);

    await expect(port.startSession(sameRobot.id)).rejects.toMatchObject({
      name: 'SessionConflictError',
      sessionId: first.id,
    });
    expect((await port.listOperationalSessions()).filter((item) => item.status === 'active')).toHaveLength(2);
    port.dispose();
  });

  it('outcome 없이 원본을 저장하고 필수 스트림 단절은 aborted와 확인 필요로 전환한다', async () => {
    let now = 1_800_000_000_000;
    const port = createInMemoryFlywheel({ nowMs: () => now });
    const session = await port.createHumanoidSession({
      projectId: 'project-tiger',
      siteId: 'site-lab',
      name: 'disconnect recovery',
      robotId: 'robot-003',
      sensorDeviceId: 'sensor-rig-001',
      taskId: 'task-sort',
      instruction: 'Sort objects',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);
    now += 10_000;
    await port.reportStreamFailure(session.id, 'camera-head', true);

    expect(await port.getEpisode(episode.id)).toMatchObject({
      status: 'completed',
      outcome: 'aborted',
      qualityStatus: 'quarantined',
    });
    expect(await port.getSession(session.id)).toMatchObject({
      status: 'failed',
      activeEpisodeId: null,
    });
    expect(await port.getCollectionTelemetry(session.id)).toMatchObject({
      connectionState: 'offline',
      qualityVerdict: 'not-ready',
      sync: { state: 'out-of-sync' },
    });
    port.dispose();
  });

  it('수집 telemetry가 정상·선택 stream 저하·drift와 missing 경고를 구조화한다', async () => {
    let now = 1_800_000_000_000;
    const port = createInMemoryFlywheel({ nowMs: () => now });
    const session = await port.createHumanoidSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'telemetry scenario',
      robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', taskId: 'task-sort',
      instruction: 'Sort objects',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    await port.startEpisode(session.id);
    now += 10_000;

    const healthy = await port.getCollectionTelemetry(session.id);
    expect(healthy).toMatchObject({
      connectionState: 'live',
      completenessPercent: 99.8,
      qualityVerdict: 'training-ready',
      sync: { maxDriftMs: 18, state: 'aligned', toleranceMs: 50 },
    });
    expect(healthy?.totalSampleCount).toBeGreaterThan(0);
    expect(healthy?.timeline.tracks.map((track) => track.label)).toEqual([
      'RGB', 'Depth', 'Robot State', 'Action',
    ]);
    expect(healthy?.spatial).toMatchObject({
      coordinateFrame: 'base_link',
      pointCloud: { available: true, pointCount: 307_200 },
    });

    await port.reportStreamFailure(session.id, 'camera-head-depth', false);
    const degraded = await port.getCollectionTelemetry(session.id);
    expect(degraded).toMatchObject({
      connectionState: 'stale',
      completenessPercent: 98.7,
      qualityVerdict: 'review',
      sync: { maxDriftMs: 74, state: 'warning' },
    });
    expect(degraded?.streams.find((stream) => stream.streamId === 'camera-head-depth'))
      .toMatchObject({
        health: 'degraded',
        latencyMs: 128,
        missingSampleCount: 7,
        droppedFrameCount: 14,
      });
    expect(degraded?.qualityIssues.map((issue) => issue.id)).toEqual([
      'degraded-camera-head-depth',
      'sync-drift',
    ]);
    expect(degraded?.timeline.tracks.find((track) => track.streamId === 'camera-head-depth')?.anomalies)
      .toHaveLength(2);
    port.dispose();
  });

  it('Episode finalizing 실패 후 다시 저장하거나 invalid로 보존한다', async () => {
    vi.useFakeTimers();
    const port = new InMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanoidSession({
      projectId: 'project-tiger',
      siteId: 'site-lab',
      name: 'finalization recovery',
      robotId: 'robot-003',
      sensorDeviceId: 'sensor-rig-001',
      taskId: 'task-sort',
      instruction: 'Sort objects',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const retryEpisode = await port.startEpisode(session.id);
    port.simulateEpisodeFinalizationFailure(retryEpisode.id);
    await port.retryEpisodeFinalization(retryEpisode.id);
    await vi.advanceTimersByTimeAsync(250);
    expect(await port.getEpisode(retryEpisode.id)).toMatchObject({ status: 'completed' });
    await port.saveEpisode(retryEpisode.id);

    const invalidEpisode = await port.startEpisode(session.id);
    port.simulateEpisodeFinalizationFailure(invalidEpisode.id);
    await port.invalidateEpisode(invalidEpisode.id);
    expect(await port.getEpisode(invalidEpisode.id)).toMatchObject({
      status: 'invalid',
      qualityStatus: 'quarantined',
    });
    const recoveredSession = await port.getSession(session.id);
    expect(recoveredSession?.kind).toBe('humanoid');
    if (recoveredSession?.kind !== 'humanoid') throw new Error('expected humanoid');
    expect(recoveredSession.activeEpisodeId).toBeNull();
    port.dispose();
  });

  it('녹화 중이거나 검토 중인 Episode를 폐기하고 세션은 수집 가능 상태로 유지한다', async () => {
    vi.useFakeTimers();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanoidSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'delete episode', robotId: 'robot-003',
      sensorDeviceId: 'sensor-rig-001', taskId: 'task-sort', instruction: 'Sort objects',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);

    await port.deleteEpisode(episode.id);

    expect(await port.getEpisode(episode.id)).toBeNull();
    expect(await port.getSession(session.id)).toMatchObject({
      activeEpisodeId: null,
      episodeIds: [],
      status: 'active',
    });

    const reviewEpisode = await port.startEpisode(session.id);
    await port.stopEpisode(reviewEpisode.id);
    await vi.advanceTimersByTimeAsync(250);
    await port.deleteEpisode(reviewEpisode.id);

    expect(await port.getEpisode(reviewEpisode.id)).toBeNull();
    expect(await port.getSession(session.id)).toMatchObject({
      activeEpisodeId: null,
      episodeIds: [],
      status: 'active',
    });
    port.dispose();
  });

  it('Episode 없는 세션은 폐기하고 processing 실패는 카탈로그 등록 없이 재처리한다', async () => {
    vi.useFakeTimers();
    let now = 1_800_000_000_000;
    const port = new InMemoryFlywheel({ nowMs: () => now });
    const datasetCount = (await port.listDatasets()).length;
    const empty = await port.createHumanoidSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'empty', robotId: 'robot-003',
      sensorDeviceId: 'sensor-rig-001', taskId: 'task-sort', instruction: 'Sort objects',
    });
    await port.validateSession(empty.id);
    await port.startSession(empty.id);
    expect(await port.stopSession(empty.id)).toMatchObject({ status: 'abandoned' });
    expect(await port.getCatalogCollection(empty.id)).toBeNull();

    const session = await port.createHumanoidSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'processing retry', robotId: 'robot-003',
      sensorDeviceId: 'sensor-rig-001', taskId: 'task-sort', instruction: 'Sort objects',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);
    now += 5_000;
    await port.stopEpisode(episode.id);
    await vi.advanceTimersByTimeAsync(250);
    await port.saveEpisode(episode.id);
    await port.stopSession(session.id);
    port.simulateSessionProcessingFailure(session.id);

    expect(await port.getCatalogCollection(session.id)).toBeNull();
    expect(await port.getSession(session.id)).toMatchObject({ status: 'failed' });
    await port.retrySessionProcessing(session.id);
    await vi.advanceTimersByTimeAsync(500);
    expect(await port.getCatalogCollection(session.id)).toMatchObject({ id: session.id });
    expect(await port.listDatasets()).toHaveLength(datasetCount);
    port.dispose();
  });

  it('진행 세션을 Episode와 함께 삭제한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanoidSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'delete operational', robotId: 'robot-003',
      sensorDeviceId: 'sensor-rig-001', taskId: 'task-sort', instruction: 'Sort objects',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);

    await port.deleteOperationalSession(session.id);

    expect(await port.getSession(session.id)).toBeNull();
    expect(await port.getEpisode(episode.id)).toBeNull();
    port.dispose();
  });

  it('카탈로그를 삭제하되 Dataset이 참조하는 Episode는 보존한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });

    await port.deleteCatalogCollection('capture-h-001');

    expect(await port.getCatalogCollection('capture-h-001')).toBeNull();
    expect(await port.getEpisode('episode-fw-001')).not.toBeNull();
    expect(await port.getEpisode('episode-fw-002')).toBeNull();
    expect(await port.getDataset('dataset-h-v3')).toMatchObject({
      unitRefs: [{ kind: 'episode', episodeId: 'episode-fw-001' }],
    });
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
