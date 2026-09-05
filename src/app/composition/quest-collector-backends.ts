import {
  decodeHandPoseBatch,
  type HandPoseFrame,
  type QuestCollectorBackendPort,
  type QuestCollectorCommandState,
  type QuestPairingResult,
  type WebXrFrameObservation,
} from '@/entities/hand-pose';
import type { CollectionHandPoseFrame, FlywheelPort } from '@/entities/flywheel';
import type { ClockPort } from '@/shared/lib/clock';

export class InMemoryQuestCollectorBackend implements QuestCollectorBackendPort {
  readonly availability = 'available' as const;
  readonly #clock: ClockPort;
  readonly #flywheel: FlywheelPort;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribeFlywheel: () => void;
  readonly #episodeTimeline = new Map<string, {
    readonly frameEpoch: number;
    readonly epochDeviceTimestampMs: number;
    readonly epochOffsetMs: number;
    readonly lastOffsetMs: number;
  }>();
  #connected = false;
  #networkAvailable = true;

  constructor(flywheel: FlywheelPort, clock: ClockPort) {
    this.#flywheel = flywheel;
    this.#clock = clock;
    this.#unsubscribeFlywheel = flywheel.subscribe(() => {
      if (this.#connected) this.#listeners.forEach((listener) => listener());
    });
  }

  async pair(pairingCode: string): Promise<QuestPairingResult> {
    this.#assertNetwork();
    const sessions = await this.#flywheel.listSessions();
    const session = sessions.find((item) => (
      item.kind === 'humanoid'
      && item.humanDemonstration?.pairing.code === pairingCode
    ));
    const source = session?.kind === 'humanoid'
      ? session.humanDemonstration?.sourceBindings.find((item) => item.role === 'xr-hand-tracking')
      : undefined;
    if (session?.kind !== 'humanoid' || session.humanDemonstration === null || source === undefined) {
      throw new Error('유효한 Human Demonstration pairing code가 아닙니다.');
    }
    const result = await this.#flywheel.pairHumanDemonstrationSource({
      pairingCode,
      sourceDeviceId: source.sourceDeviceId,
      integrationProfileId: source.integrationProfileId,
      capabilities: ['left-hand-pose', 'right-hand-pose'],
    });
    return {
      sessionId: result.sessionId,
      sourceDeviceId: result.sourceDeviceId,
      participantId: result.participantId,
      activeEpisodeId: result.activeEpisodeId,
      policy: result.profile.handTracking,
    };
  }

  connect(): Promise<void> {
    this.#assertNetwork();
    this.#connected = true;
    return Promise.resolve();
  }

  disconnect(): void {
    this.#connected = false;
  }

  async getCommandState(pairing: QuestPairingResult): Promise<QuestCollectorCommandState> {
    this.#assertConnected();
    const session = await this.#flywheel.getSession(pairing.sessionId);
    if (session?.kind !== 'humanoid' || session.humanDemonstration === null) {
      throw new Error('페어링된 Human Demonstration Session이 없습니다.');
    }
    const source = session.humanDemonstration.sourceBindings.find(
      (item) => item.sourceDeviceId === pairing.sourceDeviceId,
    );
    if (source === undefined) throw new Error('페어링된 source binding이 없습니다.');
    const episode = session.activeEpisodeId === null
      ? null
      : await this.#flywheel.getEpisode(session.activeEpisodeId);
    return {
      sessionId: session.id,
      activeEpisodeId: episode?.status === 'recording' ? episode.id : null,
      sourceState: source.state,
    };
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  acknowledge(input: {
    readonly sessionId: string;
    readonly episodeId: string;
    readonly sourceDeviceId: string;
    readonly command: 'start' | 'stop';
    readonly state: 'acknowledged' | 'rejected';
    readonly detail: string | null;
  }): Promise<void> {
    this.#assertConnected();
    return this.#flywheel.acknowledgeCollectorCommand({
      ...input,
      acknowledgedAtMs: this.#clock.nowMs(),
    }).then(() => undefined);
  }

  async sendHandPoseBatch(input: {
    readonly pairing: QuestPairingResult;
    readonly frames: readonly HandPoseFrame[];
    readonly payload: ArrayBuffer;
  }): Promise<{ readonly receivedTimestampMs: number }> {
    this.#assertConnected();
    const frames = decodeHandPoseBatch(input.payload);
    if (frames.length !== input.frames.length) throw new Error('Hand Pose batch frame 수가 일치하지 않습니다.');
    if (frames.some((frame) => (
      frame.sessionId !== input.pairing.sessionId
      || frame.sourceDeviceId !== input.pairing.sourceDeviceId
      || frame.episodeId !== frames[0]?.episodeId
    ))) {
      throw new Error('Hand Pose batch의 Session, Episode 또는 source가 일치하지 않습니다.');
    }
    const first = frames[0];
    const last = frames.at(-1);
    if (first === undefined || last === undefined) throw new Error('Hand Pose batch가 비어 있습니다.');
    const receivedTimestampMs = this.#clock.nowMs();
    const retainedFrames = this.#buildEpisodeFrames(
      first.episodeId,
      frames,
      receivedTimestampMs,
      input.pairing.policy.targetRateHz,
    );
    await this.#flywheel.reportHandPoseBatch({
      sessionId: first.sessionId,
      episodeId: first.episodeId,
      sourceDeviceId: first.sourceDeviceId,
      firstSequence: first.sequence,
      lastSequence: last.sequence,
      frameCount: frames.length,
      byteLength: input.payload.byteLength,
      deviceTimestampMs: last.deviceMonotonicTimestampMs,
      receivedTimestampMs,
      leftPoseObserved: last.hands.left.poseObserved,
      rightPoseObserved: last.hands.right.poseObserved,
      leftSourcePresent: last.hands.left.sourcePresent,
      rightSourcePresent: last.hands.right.sourcePresent,
      latestHandPose: {
        coordinateFrame: last.coordinateFrame,
        deviceTimestampMs: last.deviceMonotonicTimestampMs,
        receivedTimestampMs,
        hands: last.hands,
      },
      frames: retainedFrames,
    });
    return { receivedTimestampMs };
  }

  async sendHandPosePreview(input: {
    readonly pairing: QuestPairingResult;
    readonly observation: WebXrFrameObservation;
  }): Promise<{ readonly receivedTimestampMs: number }> {
    this.#assertConnected();
    const receivedTimestampMs = this.#clock.nowMs();
    await this.#flywheel.reportHandPosePreview({
      sessionId: input.pairing.sessionId,
      sourceDeviceId: input.pairing.sourceDeviceId,
      deviceTimestampMs: input.observation.deviceMonotonicTimestampMs,
      receivedTimestampMs,
      coordinateFrame: 'quest-local-floor',
      hands: input.observation.hands,
    });
    return { receivedTimestampMs };
  }

  async updatePresence(
    pairing: QuestPairingResult,
    state: QuestCollectorCommandState['sourceState'],
  ): Promise<void> {
    if (state !== 'offline') this.#assertNetwork();
    await this.#flywheel.updateHumanDemonstrationSource(
      pairing.sessionId,
      pairing.sourceDeviceId,
      state,
    );
  }

  setNetworkAvailable(available: boolean): void {
    this.#networkAvailable = available;
    if (!available) this.#connected = false;
    this.#listeners.forEach((listener) => listener());
  }

  dispose(): void {
    this.#connected = false;
    this.#listeners.clear();
    this.#episodeTimeline.clear();
    this.#unsubscribeFlywheel();
  }

  #buildEpisodeFrames(
    episodeId: string,
    frames: readonly HandPoseFrame[],
    receivedTimestampMs: number,
    targetRateHz: number,
  ): readonly CollectionHandPoseFrame[] {
    const frameIntervalMs = targetRateHz > 0 ? 1_000 / targetRateHz : 0;
    let timeline = this.#episodeTimeline.get(episodeId) ?? null;
    const retained = frames.map((frame) => {
      if (timeline === null) {
        timeline = {
          frameEpoch: frame.frameEpoch,
          epochDeviceTimestampMs: frame.deviceMonotonicTimestampMs,
          epochOffsetMs: 0,
          lastOffsetMs: 0,
        };
      } else if (timeline.frameEpoch !== frame.frameEpoch) {
        timeline = {
          frameEpoch: frame.frameEpoch,
          epochDeviceTimestampMs: frame.deviceMonotonicTimestampMs,
          epochOffsetMs: timeline.lastOffsetMs + frameIntervalMs,
          lastOffsetMs: timeline.lastOffsetMs + frameIntervalMs,
        };
      }
      const episodeOffsetMs = Math.max(
        timeline.lastOffsetMs,
        timeline.epochOffsetMs
          + frame.deviceMonotonicTimestampMs
          - timeline.epochDeviceTimestampMs,
      );
      timeline = { ...timeline, lastOffsetMs: episodeOffsetMs };
      return {
        sequence: frame.sequence,
        frameEpoch: frame.frameEpoch,
        episodeOffsetMs,
        coordinateFrame: frame.coordinateFrame,
        deviceTimestampMs: frame.deviceMonotonicTimestampMs,
        receivedTimestampMs,
        hands: frame.hands,
      } satisfies CollectionHandPoseFrame;
    });
    if (timeline !== null) this.#episodeTimeline.set(episodeId, timeline);
    return retained;
  }

  #assertNetwork(): void {
    if (!this.#networkAvailable) throw new Error('Mock collector network가 중단되었습니다.');
  }

  #assertConnected(): void {
    this.#assertNetwork();
    if (!this.#connected) throw new Error('Collector Backend 연결이 끊겼습니다.');
  }
}

export function createUnavailableQuestCollectorBackend(): QuestCollectorBackendPort {
  const message = 'Collector Backend pairing, command, acknowledgement 및 binary ingestion 계약이 구성되지 않았습니다.';
  const reject = <T>(): Promise<T> => Promise.reject(new Error(message));
  return {
    availability: 'unavailable',
    pair: reject,
    connect: reject,
    disconnect: () => undefined,
    getCommandState: reject,
    subscribe: () => () => undefined,
    acknowledge: reject,
    sendHandPoseBatch: reject,
    sendHandPosePreview: reject,
    updatePresence: reject,
  };
}
