import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CollectionHandPoseFrame, FlywheelPort } from '../model/flywheel';
import { createInMemoryFlywheel, type InMemoryFlywheelSyncTransport } from './in-memory-flywheel';

class DelayedBus {
  readonly listeners = new Map<string, (message: string) => void>();
  readonly paused = new Set<string>();
  readonly pending: { sender: string; message: string }[] = [];
  readonly sent: string[] = [];

  transport(clientId: string): InMemoryFlywheelSyncTransport {
    return {
      clientId,
      send: (message) => {
        this.sent.push(message);
        if (this.paused.has(clientId)) this.pending.push({ sender: clientId, message });
        else this.deliver(message);
      },
      subscribe: (listener) => {
        this.listeners.set(clientId, listener);
        return () => { this.listeners.delete(clientId); };
      },
    };
  }

  deliver(message: string): void {
    this.listeners.forEach((listener) => listener(message));
  }

  flush(reverse = false): string[] {
    const messages = this.pending.splice(0).map(({ message }) => message);
    if (reverse) messages.reverse();
    messages.forEach((message) => this.deliver(message));
    return messages;
  }
}

const clock = { nowMs: () => Date.now() };
const ports: FlywheelPort[] = [];

function connect(bus: DelayedBus, clientId: string): FlywheelPort {
  const port = createInMemoryFlywheel(clock, { syncTransport: bus.transport(clientId) });
  ports.push(port);
  return port;
}

async function prepare(pc: FlywheelPort, quest: FlywheelPort): Promise<string> {
  const session = await pc.createHumanDemonstrationSession({
    projectId: 'project-tiger', siteId: 'site-lab', name: '순서가 바뀐 장치 메시지',
    taskId: 'task-sort', instruction: '물체 분류', exoskeletonDeviceId: 'exoskeleton-001',
    questDeviceId: 'quest2-001', headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: '',
  });
  await quest.updateHumanDemonstrationSource(session.id, 'quest2-001', 'ready');
  await pc.validateSession(session.id);
  await pc.startSession(session.id);
  return session.id;
}

function acknowledge(port: FlywheelPort, sessionId: string, episodeId: string, command: 'start' | 'stop') {
  return port.acknowledgeCollectorCommand({
    sessionId, episodeId, sourceDeviceId: 'quest2-001', command,
    state: 'acknowledged', acknowledgedAtMs: clock.nowMs(), detail: null,
  });
}

async function sendFrame(port: FlywheelPort, sessionId: string, episodeId: string, sequence: number): Promise<CollectionHandPoseFrame> {
  const frame: CollectionHandPoseFrame = {
    coordinateFrame: 'quest-local-floor', sequence, frameEpoch: 1, episodeOffsetMs: sequence * 33,
    deviceTimestampMs: sequence * 33, receivedTimestampMs: clock.nowMs() + sequence * 33,
    hands: {
      left: { sourcePresent: false, poseObserved: false, joints: [] },
      right: { sourcePresent: false, poseObserved: false, joints: [] },
    },
  };
  await port.reportHandPoseBatch({
    sessionId, episodeId, sourceDeviceId: 'quest2-001', firstSequence: sequence, lastSequence: sequence,
    frameCount: 1, byteLength: 128, deviceTimestampMs: frame.deviceTimestampMs,
    receivedTimestampMs: frame.receivedTimestampMs, leftPoseObserved: false, rightPoseObserved: false,
    leftSourcePresent: false, rightSourcePresent: false, latestHandPose: frame, frames: [frame],
  });
  return frame;
}

describe.each([['a-pc', 'z-quest'], ['z-pc', 'a-quest']])('장치별 동기화 (%s / %s)', (pcId, questId) => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    ports.splice(0).forEach((port) => port.dispose());
    vi.useRealTimers();
  });

  it('늦은 대기 heartbeat가 시작 명령을 취소하지 않고 다음 녹화도 유지한다', async () => {
    const bus = new DelayedBus();
    const pc = connect(bus, pcId);
    const quest = connect(bus, questId);
    const sessionId = await prepare(pc, quest);
    bus.paused.add(questId);
    await quest.updateHumanDemonstrationSource(sessionId, 'quest2-001', 'ready');
    const first = await pc.startEpisode(sessionId);
    bus.flush();
    expect(await pc.getSession(sessionId)).toMatchObject({ activeEpisodeId: first.id });
    expect(await quest.getEpisode(first.id)).toMatchObject({ status: 'recording' });
    bus.paused.clear();
    await acknowledge(quest, sessionId, first.id, 'start');
    await pc.stopEpisode(first.id);
    await acknowledge(quest, sessionId, first.id, 'stop');
    await vi.advanceTimersByTimeAsync(250);
    bus.paused.add(pcId);
    await pc.saveEpisode(first.id);
    await quest.updateHumanDemonstrationSource(sessionId, 'quest2-001', 'ready');
    const next = await pc.startEpisode(sessionId);
    bus.flush(true);
    bus.paused.clear();
    await acknowledge(quest, sessionId, next.id, 'start');
    await acknowledge(quest, sessionId, first.id, 'stop');
    for (const port of [pc, quest]) {
      expect(await port.getSession(sessionId)).toMatchObject({ activeEpisodeId: next.id });
      const current = await port.getSession(sessionId);
      expect(current?.kind === 'humanoid' && current.humanDemonstration?.sourceBindings.find((source) => source.sourceDeviceId === 'quest2-001'))
        .toMatchObject({ state: 'recording', activeEpisodeId: next.id });
      expect(await port.getEpisode(next.id)).toMatchObject({ status: 'recording' });
    }
  });

  it('역순·중복 프레임과 최종 전송 응답을 보존하고 탭 재접속 후에도 저장한다', async () => {
    const bus = new DelayedBus();
    let pc = connect(bus, pcId);
    let quest = connect(bus, questId);
    const sessionId = await prepare(pc, quest);
    const episode = await pc.startEpisode(sessionId);
    bus.paused.add(questId);
    const frames = [];
    for (let sequence = 0; sequence < 3; sequence += 1) frames.push(await sendFrame(quest, sessionId, episode.id, sequence));
    await pc.stopEpisode(episode.id);
    bus.paused.add(pcId);
    await vi.advanceTimersByTimeAsync(250);
    await acknowledge(quest, sessionId, episode.id, 'stop');
    const messages = bus.flush(true);
    messages.forEach((message) => bus.deliver(message));
    bus.paused.clear();
    for (const port of [pc, quest]) {
      expect(await port.getEpisode(episode.id)).toMatchObject({ status: 'completed' });
      for (const frame of frames) expect(await port.getEpisodeHandPoseAt(episode.id, frame.episodeOffsetMs)).toEqual(frame);
    }
    quest.dispose();
    quest = connect(bus, `${questId}-reloaded`);
    await quest.updateHumanDemonstrationSource(sessionId, 'quest2-001', 'ready');
    pc.dispose();
    pc = connect(bus, `${pcId}-reloaded`);
    for (const frame of frames) expect(await pc.getEpisodeHandPoseAt(episode.id, frame.episodeOffsetMs)).toEqual(frame);
    await expect(pc.saveEpisode(episode.id)).resolves.toMatchObject({ id: episode.id });
    const observer = connect(bus, 'observer');
    expect(await observer.getSession(sessionId)).toMatchObject({ activeEpisodeId: null });
    const snapshots = bus.sent.map((message) => JSON.parse(message) as {
      type: string; snapshot?: { handPoseFrames: [string, CollectionHandPoseFrame[]][] };
      frames?: [string, CollectionHandPoseFrame[]][];
    });
    const latest = snapshots.filter((message) => message.type === 'state-snapshot').at(-1);
    expect(latest?.snapshot?.handPoseFrames.find(([id]) => id === episode.id)?.[1]).toEqual(frames);
    expect(snapshots.filter((message) => message.type === 'collector-update' && message.frames?.length)
      .map((message) => message.frames?.[0]?.[1].length)).toEqual([1, 1, 1]);
  });

  it('폐기와 재수집 사이에 늦게 도착한 원본은 이전 Episode를 되살리지 않는다', async () => {
    const bus = new DelayedBus();
    const pc = connect(bus, pcId);
    const quest = connect(bus, questId);
    const sessionId = await prepare(pc, quest);
    const first = await pc.startEpisode(sessionId);
    bus.paused.add(questId);
    await sendFrame(quest, sessionId, first.id, 0);
    await pc.deleteEpisode(first.id);
    const next = await pc.startEpisode(sessionId);
    bus.flush(true);
    bus.paused.clear();
    const observer = connect(bus, 'observer');
    const lateMessage = bus.sent.filter((message) => message.includes('"type":"collector-update"')).at(-1);
    if (lateMessage === undefined) throw new Error('지연된 장치 메시지가 필요합니다.');
    bus.deliver(lateMessage);
    for (const port of [pc, quest, observer]) {
      expect(await port.getEpisode(first.id)).toBeNull();
      expect(await port.getEpisodeHandPoseAt(first.id, 0)).toBeNull();
      expect(await port.getSession(sessionId)).toMatchObject({ activeEpisodeId: next.id, episodeIds: [next.id] });
    }
  });

  it('새 탭에 시작 상태보다 먼저 도착한 프레임도 초기 동기화 후 보존한다', async () => {
    const bus = new DelayedBus();
    const pc = connect(bus, pcId);
    const quest = connect(bus, questId);
    const sessionId = await prepare(pc, quest);
    const observer = connect(bus, 'observer');
    bus.paused.add(pcId);
    const episode = await pc.startEpisode(sessionId);
    const startMessage = bus.pending.at(-1)?.message;
    if (startMessage === undefined) throw new Error('녹화 시작 메시지가 필요합니다.');
    bus.listeners.get(questId)?.(startMessage);
    const frame = await sendFrame(quest, sessionId, episode.id, 0);
    expect(await observer.getEpisode(episode.id)).toBeNull();
    bus.flush();
    expect(await observer.getEpisode(episode.id)).toMatchObject({ status: 'recording' });
    expect(await observer.getEpisodeHandPoseAt(episode.id, 0)).toEqual(frame);
  });

  it('PC 재접속 후 폐기한 Episode ID를 재사용하지 않는다', async () => {
    const bus = new DelayedBus();
    let pc = connect(bus, pcId);
    const quest = connect(bus, questId);
    const sessionId = await prepare(pc, quest);
    const first = await pc.startEpisode(sessionId);
    await pc.deleteEpisode(first.id);
    pc.dispose();
    pc = connect(bus, `${pcId}-reloaded`);
    const next = await pc.startEpisode(sessionId);
    expect(next.id).not.toBe(first.id);
    const frame = await sendFrame(quest, sessionId, next.id, 0);
    expect(await pc.getEpisodeHandPoseAt(next.id, 0)).toEqual(frame);
  });
});
