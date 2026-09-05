import { afterEach, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel } from '@/entities/flywheel';
import { QuestCollectorAdapter, SimulatedWebXrRuntime } from '@/entities/hand-pose';

import { InMemoryQuestCollectorBackend } from './quest-collector-backends';

const cleanup: (() => void)[] = [];

afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers();
  const clock = { nowMs: () => Date.now() };
  const flywheel = createInMemoryFlywheel(clock);
  const backend = new InMemoryQuestCollectorBackend(flywheel, clock);
  const runtime = new SimulatedWebXrRuntime();
  const collector = new QuestCollectorAdapter({ backend, runtime, nowMs: clock.nowMs });
  cleanup.push(() => { collector.dispose(); backend.dispose(); flywheel.dispose(); });
  const session = await flywheel.createHumanDemonstrationSession({
    projectId: 'project-tiger', siteId: 'site-lab', name: '원본 전송 검증',
    taskId: 'task-sort', instruction: '물체 분류', exoskeletonDeviceId: 'exoskeleton-001',
    questDeviceId: 'quest2-001', headCameraDeviceId: 'rbp-headcam-001',
    externalCameraDeviceId: 'external-camera-001',
  });
  if (!session.humanDemonstration) throw new Error('수집 장치 연결 정보가 필요합니다.');
  await collector.checkSupport();
  await collector.pair(session.humanDemonstration.pairing.code);
  let recordedFrameCount = 0;
  const actualStart = runtime.start.bind(runtime);
  const start = vi.spyOn(runtime, 'start').mockImplementation((onFrame, onEnded) => actualStart((observation) => {
    if (collector.getSnapshot().recording.state === 'recording') recordedFrameCount += 1;
    onFrame(observation);
  }, onEnded));
  return { flywheel, backend, collector, session, start, recordedFrameCount: () => recordedFrameCount };
}

async function startRecording(context: Awaited<ReturnType<typeof setup>>) {
  await context.collector.startImmersiveSession();
  await context.flywheel.validateSession(context.session.id);
  await context.flywheel.startSession(context.session.id);
  const episode = await context.flywheel.startEpisode(context.session.id);
  await vi.waitFor(() => expect(context.collector.getSnapshot().recording.state).toBe('recording'));
  return episode;
}

it('전송 중 배치와 남은 전체 원본을 저장한 뒤에만 정지 완료와 다음 녹화를 허용한다', async () => {
  const context = await setup();
  const { flywheel, backend, collector, session } = context;
  const actualSend = backend.sendHandPoseBatch.bind(backend);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const send = vi.spyOn(backend, 'sendHandPoseBatch').mockImplementationOnce(async (input) => {
    await gate;
    return actualSend(input);
  });
  const episode = await startRecording(context);
  await vi.advanceTimersByTimeAsync(300);
  expect(send).toHaveBeenCalledTimes(1);
  expect(collector.getSnapshot().backend.sentFrameCount).toBe(0);
  await flywheel.stopEpisode(episode.id);
  await vi.waitFor(() => expect(collector.getSnapshot().recording).toMatchObject({
    state: 'stopping', command: 'stop', acknowledgement: 'pending',
  }));
  const frameCount = context.recordedFrameCount();
  const queuedFrameCount = collector.getSnapshot().backend.queuedFrameCount;
  expect(queuedFrameCount).toBeGreaterThan(session.humanDemonstration?.profile.handTracking.maximumBatchFrames ?? 4);
  await vi.advanceTimersByTimeAsync(500);
  expect(context.recordedFrameCount()).toBe(frameCount);
  expect(collector.getSnapshot().backend.queuedFrameCount).toBe(queuedFrameCount);
  await expect(flywheel.saveEpisode(episode.id)).rejects.toThrow('원본 전송이 끝나지 않았습니다');
  await expect(flywheel.setEpisodeOutcome(episode.id, 'success')).rejects.toThrow('원본 전송이 끝나지 않았습니다');
  await expect(flywheel.deleteEpisode(episode.id)).rejects.toThrow('원본 전송이 끝나지 않았습니다');

  release();
  await vi.waitFor(() => expect(collector.getSnapshot().recording).toMatchObject({
    state: 'review', command: 'stop', acknowledgement: 'acknowledged',
  }));
  expect(send.mock.calls.length).toBeGreaterThan(2);
  expect(collector.getSnapshot().backend).toMatchObject({
    state: 'live', sentFrameCount: frameCount, queuedFrameCount: 0, droppedFrameCount: 0,
  });
  await expect(flywheel.getEpisodeHandPoseAt(episode.id, 0)).resolves.toMatchObject({ sequence: 0 });
  await expect(flywheel.getEpisodeHandPoseAt(episode.id, Number.MAX_SAFE_INTEGER))
    .resolves.toMatchObject({ sequence: frameCount - 1 });
  await flywheel.saveEpisode(episode.id);
  const nextEpisode = await flywheel.startEpisode(session.id);
  await vi.waitFor(() => expect(collector.getSnapshot().recording).toMatchObject({
    state: 'recording', episodeId: nextEpisode.id,
  }));
  await vi.advanceTimersByTimeAsync(150);
  await expect(flywheel.getEpisodeHandPoseAt(nextEpisode.id, 0)).resolves.toMatchObject({ sequence: frameCount });
  await expect(flywheel.getEpisodeHandPoseAt(episode.id, Number.MAX_SAFE_INTEGER))
    .resolves.toMatchObject({ sequence: frameCount - 1 });
});

it('정지 중 전송 실패는 완료로 응답하지 않고 재연결 후 남은 원본을 복구한다', async () => {
  const context = await setup();
  const { flywheel, backend, collector } = context;
  let reject!: (reason: Error) => void;
  vi.spyOn(backend, 'sendHandPoseBatch').mockImplementationOnce(() => new Promise((_, rejectBatch) => {
    reject = rejectBatch;
  }));
  const episode = await startRecording(context);
  await vi.advanceTimersByTimeAsync(300);
  await flywheel.stopEpisode(episode.id);
  await vi.waitFor(() => expect(collector.getSnapshot().recording.state).toBe('stopping'));
  const frameCount = context.recordedFrameCount();
  reject(new Error('일시적 전송 실패'));
  await vi.advanceTimersByTimeAsync(250);
  expect(collector.getSnapshot()).toMatchObject({
    recording: { state: 'stopping', acknowledgement: 'pending' },
    backend: { state: 'reconnecting', queuedFrameCount: frameCount, sentFrameCount: 0 },
  });
  await expect(flywheel.saveEpisode(episode.id)).rejects.toThrow('원본 전송이 끝나지 않았습니다');
  await collector.reconnectBackend();
  await vi.waitFor(() => expect(collector.getSnapshot().recording.state).toBe('review'));
  expect(collector.getSnapshot().backend).toMatchObject({ sentFrameCount: frameCount, queuedFrameCount: 0 });
  await expect(flywheel.getEpisodeHandPoseAt(episode.id, Number.MAX_SAFE_INTEGER))
    .resolves.toMatchObject({ sequence: frameCount - 1 });
  await expect(flywheel.saveEpisode(episode.id)).resolves.toMatchObject({ id: episode.id });
});

it('MR 준비 상태 전송 실패 시 생성한 XR 세션을 종료하고 다시 시작할 수 있다', async () => {
  const { flywheel, backend, collector, start, session } = await setup();
  const initialTimerCount = vi.getTimerCount();
  vi.spyOn(backend, 'updatePresence').mockRejectedValueOnce(new Error('준비 상태 전송 실패'));
  await expect(collector.startImmersiveSession()).rejects.toThrow('준비 상태 전송 실패');
  expect(collector.getSnapshot().immersive.state).toBe('error');
  expect(vi.getTimerCount()).toBe(initialTimerCount);
  await collector.startImmersiveSession();
  expect(start).toHaveBeenCalledTimes(2);
  expect(collector.getSnapshot().immersive.state).toBe('running');
  const updatedSession = await flywheel.getSession(session.id);
  expect(updatedSession?.kind === 'humanoid' && updatedSession.humanDemonstration?.sourceBindings
    .find((source) => source.role === 'xr-hand-tracking')?.state).toBe('ready');
});

it('수집기를 나간 뒤 도착한 이전 배치 응답이 연결 상태와 큐를 되살리지 않는다', async () => {
  const context = await setup();
  const { flywheel, backend, collector } = context;
  const actualSend = backend.sendHandPoseBatch.bind(backend);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(backend, 'sendHandPoseBatch').mockImplementationOnce(async (input) => {
    await gate;
    return actualSend(input);
  });
  const episode = await startRecording(context);
  await vi.advanceTimersByTimeAsync(150);
  await flywheel.stopEpisode(episode.id);
  await vi.waitFor(() => expect(collector.getSnapshot().recording.state).toBe('stopping'));
  collector.leaveCollector();
  release();
  await vi.advanceTimersByTimeAsync(500);
  expect(collector.getSnapshot()).toMatchObject({
    pairing: { state: 'unpaired' }, recording: { state: 'idle' },
    backend: { state: 'offline', queuedFrameCount: 0, sentFrameCount: 0 },
  });
});
