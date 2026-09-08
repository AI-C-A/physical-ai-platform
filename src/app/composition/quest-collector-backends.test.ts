import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  encodeHandPoseBatch,
  HAND_JOINT_NAMES,
  QuestCollectorAdapter,
  SimulatedWebXrRuntime,
  type HandPoseFrame,
} from '@/entities/hand-pose';
import { createInMemoryFlywheel } from '@/entities/flywheel';

import { InMemoryQuestCollectorBackend } from './quest-collector-backends';

describe('Quest collector vertical flow', () => {
  afterEach(() => vi.useRealTimers());

  it('pairing부터 ACK, bounded backpressure, 손 유실, 재연결과 독립 종료까지 관통한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-03T10:00:00+09:00'));
    const clock = { nowMs: () => Date.now() };
    const flywheel = createInMemoryFlywheel(clock);
    const backend = new InMemoryQuestCollectorBackend(flywheel, clock);
    const runtime = new SimulatedWebXrRuntime();
    const collector = new QuestCollectorAdapter({ backend, runtime, nowMs: clock.nowMs });
    const session = await flywheel.createHumanDemonstrationSession({
      projectId: 'project-tiger',
      siteId: 'site-lab',
      name: 'Quest vertical flow',
      taskId: 'task-sort',
      instruction: 'Sort objects',
      exoskeletonDeviceId: 'exoskeleton-001',
      questDeviceId: 'quest2-001',
      headCameraDeviceId: 'rbp-headcam-001',
      externalCameraDeviceId: 'external-camera-001',
    });
    if (session.humanDemonstration === null) throw new Error('Human Demonstration binding이 필요합니다.');

    await collector.checkSupport();
    await collector.pair(session.humanDemonstration.pairing.code);
    await collector.startImmersiveSession();
    await vi.advanceTimersByTimeAsync(300);

    const previewTelemetry = await flywheel.getCollectionTelemetry(session.id);
    expect(previewTelemetry?.handPose).toMatchObject({
      coordinateFrame: 'quest-local-floor',
      hands: {
        left: { poseObserved: true, sourcePresent: true },
        right: { poseObserved: true, sourcePresent: true },
      },
    });
    expect(previewTelemetry?.handPose?.viewerPose?.positionMeters).toEqual([0, 1.6, 0]);
    expect(previewTelemetry?.streams.find((stream) => stream.streamId === 'quest-hand-left'))
      .toMatchObject({ sampleCount: 0, handTracking: { validJointCount: 25 } });
    expect(collector.getSnapshot().backend.sentFrameCount).toBe(0);
    expect((await flywheel.listEpisodes()).filter(
      (episode) => episode.captureSessionId === session.id,
    )).toHaveLength(0);

    await flywheel.validateSession(session.id);
    await flywheel.startSession(session.id);
    const episode = await flywheel.startEpisode(session.id);

    await vi.waitFor(() => {
      expect(collector.getSnapshot().recording).toMatchObject({
        state: 'recording',
        episodeId: episode.id,
        command: 'start',
        acknowledgement: 'acknowledged',
      });
    });
    await vi.advanceTimersByTimeAsync(400);

    expect(collector.getSnapshot()).toMatchObject({
      immersive: { state: 'running' },
      backend: { state: 'live' },
      hands: {
        left: { qualityState: 'tracking', validJointCount: 25 },
        right: { qualityState: 'tracking', validJointCount: 25 },
      },
    });
    expect(collector.getSnapshot().backend.sentFrameCount).toBeGreaterThan(0);
    const recordingSession = await flywheel.getSession(session.id);
    expect(recordingSession?.kind === 'humanoid'
      ? recordingSession.humanDemonstration?.collectorAcknowledgements
      : null).toEqual(expect.arrayContaining([
      expect.objectContaining({ episodeId: episode.id, command: 'start', state: 'acknowledged' }),
    ]));

    const telemetry = await flywheel.getCollectionTelemetry(session.id);
    expect(telemetry?.streams.find((stream) => stream.streamId === 'quest-hand-left')).toMatchObject({
      origin: 'sensor',
      sourceDeviceId: 'quest2-001',
      coordinateFrame: 'quest-local-floor',
      handTracking: { poseObserved: true, sourcePresent: true, validJointCount: 25 },
    });
    expect(telemetry?.handPose).toMatchObject({
      coordinateFrame: 'quest-local-floor',
      hands: {
        left: { poseObserved: true, sourcePresent: true },
        right: { poseObserved: true, sourcePresent: true },
      },
    });
    expect(telemetry?.handPose?.hands.left.joints).toHaveLength(25);
    expect(telemetry?.handPose?.hands.right.joints).toHaveLength(25);
    const firstHandFrame = await flywheel.getEpisodeHandPoseAt(episode.id, 0);
    const latestBeforeRestart = await flywheel.getEpisodeHandPoseAt(episode.id, Number.MAX_SAFE_INTEGER);
    expect(firstHandFrame).toMatchObject({ sequence: 0, episodeOffsetMs: 0, viewerPose: { positionMeters: [0, 1.6, 0] } });
    expect(latestBeforeRestart?.episodeOffsetMs).toBeGreaterThan(0);
    await expect(flywheel.getEpisodeHandPoseAt(episode.id, -1)).resolves.toBeNull();
    expect(telemetry?.streams.find((stream) => stream.streamId === 'head-depth-estimated')).toMatchObject({
      modality: 'estimated-depth',
      origin: 'derived',
      processingStatus: 'pending',
      connectionState: 'offline',
    });

    runtime.setHandObservation('left', { poseAvailable: false, sourcePresent: true });
    await vi.advanceTimersByTimeAsync(1_700);
    expect(collector.getSnapshot().hands).toMatchObject({
      left: { qualityState: 'lost', poseObserved: false, sourcePresent: true, validJointCount: 0 },
      right: { qualityState: 'tracking', poseObserved: true, sourcePresent: true, validJointCount: 25 },
    });

    backend.setNetworkAvailable(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(collector.getSnapshot().backend.state).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(2_450);
    expect(collector.getSnapshot().backend.state).toBe('error');
    expect(collector.getSnapshot().backend.queuedFrameCount).toBeLessThanOrEqual(60);
    expect(collector.getSnapshot().backend.droppedFrameCount).toBeGreaterThan(0);

    backend.setNetworkAvailable(true);
    await collector.reconnectBackend();
    await vi.advanceTimersByTimeAsync(300);
    expect(collector.getSnapshot().backend.state).toBe('live');

    await flywheel.stopEpisode(episode.id);
    await vi.waitFor(() => expect(collector.getSnapshot().recording).toMatchObject({
      state: 'review',
      episodeId: episode.id,
      command: 'stop',
      acknowledgement: 'acknowledged',
    }));
    await vi.advanceTimersByTimeAsync(250);
    const completedEpisode = await flywheel.getEpisode(episode.id);
    expect(completedEpisode?.humanDemonstration?.collectorAcknowledgements).toEqual(expect.arrayContaining([
      expect.objectContaining({ episodeId: episode.id, command: 'start', state: 'acknowledged' }),
      expect.objectContaining({ episodeId: episode.id, command: 'stop', state: 'acknowledged' }),
    ]));
    await flywheel.saveEpisode(episode.id);

    const nextEpisode = await flywheel.startEpisode(session.id);
    await vi.waitFor(() => expect(collector.getSnapshot().recording).toMatchObject({
      state: 'recording', episodeId: nextEpisode.id,
    }));
    await collector.endImmersiveSession();
    const stillActive = await flywheel.getSession(session.id);
    expect(stillActive).toMatchObject({ status: 'active', activeEpisodeId: nextEpisode.id });
    expect(await flywheel.getEpisode(nextEpisode.id)).toMatchObject({ status: 'recording' });
    expect(stillActive?.kind === 'humanoid'
      ? stillActive.humanDemonstration?.sourceBindings.find((source) => source.role === 'xr-hand-tracking')
      : null).toMatchObject({ state: 'offline' });

    collector.leaveCollector();
    expect(collector.getSnapshot()).toMatchObject({
      pairing: {
        state: 'unpaired',
        sessionId: null,
        participantId: null,
        sourceDeviceId: null,
      },
      immersive: { state: 'idle' },
      backend: {
        state: 'offline',
        queuedFrameCount: 0,
        droppedFrameCount: 0,
        sentFrameCount: 0,
        lastReceivedTimestampMs: null,
      },
    });
    await expect(collector.reconnectBackend()).rejects.toThrow('다시 연결할 Session이 없습니다.');

    collector.dispose();
    backend.dispose();
    flywheel.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('10분 network interruption에서도 frame queue를 profile 상한으로 유지하고 모든 timer를 정리한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-03T10:00:00+09:00'));
    const clock = { nowMs: () => Date.now() };
    const flywheel = createInMemoryFlywheel(clock);
    const backend = new InMemoryQuestCollectorBackend(flywheel, clock);
    const runtime = new SimulatedWebXrRuntime();
    const collector = new QuestCollectorAdapter({ backend, runtime, nowMs: clock.nowMs });
    const session = await flywheel.createHumanDemonstrationSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'Quest queue soak',
      taskId: 'task-sort', instruction: 'Sort objects', exoskeletonDeviceId: 'exoskeleton-001',
      questDeviceId: 'quest2-001', headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: 'external-camera-001',
    });
    if (session.humanDemonstration === null) throw new Error('Human Demonstration binding이 필요합니다.');
    await collector.checkSupport();
    await collector.pair(session.humanDemonstration.pairing.code);
    await collector.startImmersiveSession();
    await flywheel.validateSession(session.id);
    await flywheel.startSession(session.id);
    await flywheel.startEpisode(session.id);
    await vi.waitFor(() => expect(collector.getSnapshot().recording.state).toBe('recording'));

    backend.setNetworkAvailable(false);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(collector.getSnapshot().backend.queuedFrameCount).toBeLessThanOrEqual(60);
    expect(collector.getSnapshot().backend.droppedFrameCount).toBeGreaterThan(17_000);

    collector.dispose();
    backend.dispose();
    flywheel.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('frameEpoch가 바뀌어도 Episode offset을 연속 보존하고 폐기 시 이력을 제거한다', async () => {
    const clock = { nowMs: () => 1_800_000_000_000 };
    const flywheel = createInMemoryFlywheel(clock);
    const backend = new InMemoryQuestCollectorBackend(flywheel, clock);
    const session = await flywheel.createHumanDemonstrationSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'epoch replay', taskId: 'task-sort',
      instruction: 'Sort objects', exoskeletonDeviceId: 'exoskeleton-001', questDeviceId: 'quest2-001',
      headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: 'external-camera-001',
    });
    if (session.humanDemonstration === null) throw new Error('Human Demonstration binding이 필요합니다.');
    const pairing = await backend.pair(session.humanDemonstration.pairing.code);
    await backend.connect();
    await flywheel.updateHumanDemonstrationSource(
      pairing.sessionId,
      pairing.sourceDeviceId,
      'ready',
    );
    await flywheel.validateSession(session.id);
    await flywheel.startSession(session.id);
    const episode = await flywheel.startEpisode(session.id);
    const hands = {
      left: {
        sourcePresent: true,
        poseObserved: true,
        joints: HAND_JOINT_NAMES.map((name) => ({
          name, positionMeters: [-0.2, 1, -0.3] as const,
          orientationQuaternion: [0, 0, 0, 1] as const, radiusMeters: 0.008,
        })),
      },
      right: {
        sourcePresent: true,
        poseObserved: true,
        joints: HAND_JOINT_NAMES.map((name) => ({
          name, positionMeters: [0.2, 1, -0.3] as const,
          orientationQuaternion: [0, 0, 0, 1] as const, radiusMeters: 0.008,
        })),
      },
    } as const;
    const makeFrame = (sequence: number, frameEpoch: number, timestamp: number): HandPoseFrame => ({
      schemaVersion: 1,
      sessionId: session.id,
      episodeId: episode.id,
      sourceDeviceId: pairing.sourceDeviceId,
      sequence,
      deviceMonotonicTimestampMs: timestamp,
      clockDomain: 'webxr-dom-high-res-time',
      coordinateFrame: 'quest-local-floor',
      frameEpoch,
      hands,
    });
    const send = async (frame: HandPoseFrame) => backend.sendHandPoseBatch({
      pairing,
      frames: [frame],
      payload: encodeHandPoseBatch([frame]),
    });

    await send(makeFrame(0, 1, 1_000));
    await send(makeFrame(1, 2, 10));
    await expect(flywheel.getEpisodeHandPoseAt(episode.id, 0)).resolves.toMatchObject({
      frameEpoch: 1,
      episodeOffsetMs: 0,
    });
    const last = await flywheel.getEpisodeHandPoseAt(episode.id, Number.MAX_SAFE_INTEGER);
    expect(last).toMatchObject({ frameEpoch: 2, sequence: 1 });
    expect(last?.episodeOffsetMs).toBeCloseTo(1_000 / pairing.policy.targetRateHz, 6);

    await flywheel.deleteEpisode(episode.id);
    await expect(flywheel.getEpisodeHandPoseAt(episode.id, Number.MAX_SAFE_INTEGER)).resolves.toBeNull();
    backend.dispose();
    flywheel.dispose();
  });
});
