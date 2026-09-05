import { encodeHandPoseBatch } from '../lib/hand-pose-binary';
import { HandPoseFrameQueue } from '../lib/hand-pose-frame-queue';
import type {
  ActiveWebXrSession,
  HandPoseFrame,
  HandPoseObservation,
  Handedness,
  QuestCollectorBackendPort,
  QuestCollectorCommandState,
  QuestCollectorPort,
  QuestCollectorSnapshot,
  QuestHandStatus,
  QuestPairingResult,
  WebXrFrameObservation,
  WebXrRuntimePort,
} from '../model/hand-pose';

function emptyHandStatus(): QuestHandStatus {
  return {
    sourcePresent: false,
    poseObserved: false,
    qualityState: 'lost',
    qualityBasis: 'profile-time-policy',
    validJointCount: 0,
    consecutiveMissingMs: 0,
    observedRateHz: null,
    lastObservedAtMs: null,
  };
}

function initialSnapshot(
  runtime: WebXrRuntimePort,
  backend: QuestCollectorBackendPort,
): QuestCollectorSnapshot {
  return {
    support: {
      state: runtime.mode === 'unavailable' ? 'unavailable' : 'checking',
      secureContext: false,
      runtimeMode: runtime.mode,
      detail: runtime.mode === 'unavailable'
        ? 'WebXR runtime이 구성되지 않았습니다.'
        : 'WebXR 지원 여부를 확인하는 중입니다.',
    },
    pairing: {
      state: 'unpaired',
      sessionId: null,
      participantId: null,
      sourceDeviceId: null,
      detail: null,
    },
    immersive: { state: 'idle', detail: null },
    backend: {
      state: backend.availability === 'available' ? 'offline' : 'unavailable',
      detail: backend.availability === 'available'
        ? null
        : 'Collector Backend 계약이 연결되지 않았습니다.',
      queuedFrameCount: 0,
      droppedFrameCount: 0,
      sentFrameCount: 0,
      lastReceivedTimestampMs: null,
    },
    recording: {
      state: 'idle',
      episodeId: null,
      command: null,
      acknowledgement: null,
      detail: null,
    },
    hands: { left: emptyHandStatus(), right: emptyHandStatus() },
  };
}

interface QuestCollectorAdapterOptions {
  readonly backend: QuestCollectorBackendPort;
  readonly nowMs?: () => number;
  readonly runtime: WebXrRuntimePort;
}

/**
 * WebXR frame은 bounded queue에서만 보유하고 React에는 250ms 이하 빈도의 집계 상태만 전달한다.
 * Pairing credential은 메모리에만 머물며 영속 브라우저 저장소에 기록하지 않는다.
 */
export class QuestCollectorAdapter implements QuestCollectorPort {
  readonly #backend: QuestCollectorBackendPort;
  readonly #listeners = new Set<() => void>();
  readonly #nowMs: () => number;
  readonly #runtime: WebXrRuntimePort;
  #snapshot: QuestCollectorSnapshot;
  #pairing: QuestPairingResult | null = null;
  #queue: HandPoseFrameQueue | null = null;
  #activeSession: ActiveWebXrSession | null = null;
  #backendUnsubscribe: (() => void) | null = null;
  #flushTimer: ReturnType<typeof setTimeout> | null = null;
  #previewTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #uiTimer: ReturnType<typeof setTimeout> | null = null;
  #flushPromise: Promise<boolean> | null = null;
  #previewRunning = false;
  #commandSyncRunning = false;
  #commandSyncRequested = false;
  #sequence = 0;
  #frameEpoch = 0;
  #generation = 0;
  #lastCommandEpisodeId: string | null = null;
  #lastFrameAtMs: Record<Handedness, number | null> = { left: null, right: null };
  #missingSinceMs: Record<Handedness, number | null> = { left: null, right: null };
  #observedRateHz: Record<Handedness, number | null> = { left: null, right: null };
  #reconnectAttempt = 0;
  #latestPreviewObservation: WebXrFrameObservation | null = null;

  constructor({ backend, nowMs = () => Date.now(), runtime }: QuestCollectorAdapterOptions) {
    this.#backend = backend;
    this.#nowMs = nowMs;
    this.#runtime = runtime;
    this.#snapshot = initialSnapshot(runtime, backend);
  }

  getSnapshot(): QuestCollectorSnapshot {
    return this.#snapshot;
  }

  async checkSupport(): Promise<QuestCollectorSnapshot> {
    this.#update({
      support: { ...this.#snapshot.support, state: 'checking', detail: 'WebXR 지원 여부를 확인하는 중입니다.' },
    });
    try {
      const result = await this.#runtime.checkSupport();
      this.#update({
        support: {
          state: result.supported ? 'supported' : this.#runtime.mode === 'unavailable' ? 'unavailable' : 'unsupported',
          secureContext: result.secureContext,
          runtimeMode: this.#runtime.mode,
          detail: result.detail,
        },
      });
    } catch (reason) {
      this.#update({
        support: {
          ...this.#snapshot.support,
          state: 'error',
          detail: reason instanceof Error ? reason.message : 'WebXR 지원 여부를 확인하지 못했습니다.',
        },
      });
    }
    return this.getSnapshot();
  }

  async pair(pairingCode: string): Promise<QuestCollectorSnapshot> {
    if (!/^\d{6}$/u.test(pairingCode)) {
      this.#update({ pairing: { ...this.#snapshot.pairing, state: 'error', detail: '6자리 숫자 페어링 코드를 입력하세요.' } });
      throw new Error('6자리 숫자 페어링 코드를 입력하세요.');
    }
    if (this.#backend.availability === 'unavailable') {
      const detail = 'Collector Backend pairing endpoint가 구성되지 않았습니다.';
      this.#update({
        pairing: { ...this.#snapshot.pairing, state: 'error', detail },
        backend: { ...this.#snapshot.backend, state: 'unavailable', detail },
      });
      throw new Error(detail);
    }
    this.#update({
      pairing: { ...this.#snapshot.pairing, state: 'pairing', detail: null },
      backend: { ...this.#snapshot.backend, state: 'connecting', detail: null },
    });
    const generation = this.#generation;
    try {
      const pairing = await this.#backend.pair(pairingCode);
      if (generation !== this.#generation) {
        await this.#backend.updatePresence(pairing, 'offline').catch(() => undefined);
        return this.getSnapshot();
      }
      await this.#backend.connect(pairing);
      if (generation !== this.#generation) {
        this.#backend.disconnect();
        await this.#backend.updatePresence(pairing, 'offline').catch(() => undefined);
        return this.getSnapshot();
      }
      this.#backendUnsubscribe?.();
      this.#backendUnsubscribe = this.#backend.subscribe(() => void this.#requestCommandSync());
      this.#pairing = pairing;
      this.#queue = new HandPoseFrameQueue(pairing.policy.queueCapacityFrames);
      this.#reconnectAttempt = 0;
      this.#update({
        pairing: {
          state: 'paired',
          sessionId: pairing.sessionId,
          participantId: pairing.participantId,
          sourceDeviceId: pairing.sourceDeviceId,
          detail: null,
        },
        backend: { ...this.#snapshot.backend, state: 'live', detail: null },
      });
      await this.#requestCommandSync();
      return this.getSnapshot();
    } catch (reason) {
      if (generation !== this.#generation) return this.getSnapshot();
      const detail = reason instanceof Error ? reason.message : 'Session 페어링에 실패했습니다.';
      this.#update({
        pairing: { ...this.#snapshot.pairing, state: 'error', detail },
        backend: { ...this.#snapshot.backend, state: 'error', detail },
      });
      throw reason;
    }
  }

  async startImmersiveSession(): Promise<QuestCollectorSnapshot> {
    if (this.#pairing === null) throw new Error('먼저 Session을 페어링하세요.');
    if (this.#snapshot.support.state !== 'supported') throw new Error(this.#snapshot.support.detail);
    if (this.#activeSession !== null) return this.getSnapshot();
    const generation = ++this.#generation;
    let startedSession: ActiveWebXrSession | null = null;
    this.#update({ immersive: { state: 'starting', detail: null } });
    try {
      const activeSession = await this.#runtime.start(
        (observation) => {
          if (generation === this.#generation) this.#handleFrame(observation);
        },
        () => {
          if (generation === this.#generation) this.#handleRuntimeEnded();
        },
      );
      startedSession = activeSession;
      if (generation !== this.#generation) {
        await activeSession.end();
        return this.getSnapshot();
      }
      this.#activeSession = activeSession;
      this.#frameEpoch += 1;
      this.#update({ immersive: { state: 'running', detail: null } });
      await this.#backend.updatePresence(this.#pairing, 'ready');
      await this.#requestCommandSync(true);
      return this.getSnapshot();
    } catch (reason) {
      if (generation !== this.#generation) return this.getSnapshot();
      if (startedSession !== null) {
        this.#activeSession = null;
        await startedSession.end().catch(() => undefined);
      }
      if (generation !== this.#generation) return this.getSnapshot();
      const detail = reason instanceof Error ? reason.message : 'immersive session을 시작하지 못했습니다.';
      this.#update({ immersive: { state: 'error', detail } });
      throw reason;
    }
  }

  async endImmersiveSession(): Promise<QuestCollectorSnapshot> {
    const session = this.#activeSession;
    if (session === null) return this.getSnapshot();
    this.#update({ immersive: { state: 'ending', detail: null } });
    await session.end();
    return this.getSnapshot();
  }

  async reconnectBackend(): Promise<QuestCollectorSnapshot> {
    const pairing = this.#pairing;
    if (pairing === null) throw new Error('다시 연결할 Session이 없습니다.');
    this.#clearReconnectTimer();
    this.#update({ backend: { ...this.#snapshot.backend, state: 'reconnecting', detail: 'Backend에 다시 연결하는 중입니다.' } });
    try {
      await this.#backend.connect(pairing);
      this.#reconnectAttempt = 0;
      this.#update({ backend: { ...this.#snapshot.backend, state: 'live', detail: null } });
      await this.#backend.updatePresence(pairing, this.#activeSession === null ? 'paired' : 'ready');
      await this.#requestCommandSync(true);
      this.#scheduleFlush(0);
      return this.getSnapshot();
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Backend 재연결에 실패했습니다.';
      this.#update({ backend: { ...this.#snapshot.backend, state: 'error', detail } });
      this.#scheduleReconnect();
      throw reason;
    }
  }

  leaveCollector(): void {
    this.#generation += 1;
    this.#backendUnsubscribe?.();
    this.#backendUnsubscribe = null;
    this.#clearFlushTimer();
    this.#clearPreview();
    this.#clearReconnectTimer();
    if (this.#uiTimer !== null) clearTimeout(this.#uiTimer);
    this.#uiTimer = null;
    const pairing = this.#pairing;
    if (pairing !== null) void this.#backend.updatePresence(pairing, 'offline').catch(() => undefined);
    const activeSession = this.#activeSession;
    this.#activeSession = null;
    if (activeSession !== null) void activeSession.end().catch(() => undefined);
    this.#backend.disconnect();
    this.#queue?.clear();
    this.#pairing = null;
    this.#queue = null;
    this.#flushPromise = null;
    this.#lastCommandEpisodeId = null;
    this.#sequence = 0;
    this.#frameEpoch = 0;
    this.#lastFrameAtMs = { left: null, right: null };
    this.#missingSinceMs = { left: null, right: null };
    this.#observedRateHz = { left: null, right: null };
    this.#reconnectAttempt = 0;
    this.#snapshot = {
      ...this.#snapshot,
      pairing: {
        state: 'unpaired',
        sessionId: null,
        participantId: null,
        sourceDeviceId: null,
        detail: null,
      },
      immersive: { state: 'idle', detail: null },
      backend: {
        ...this.#snapshot.backend,
        state: this.#backend.availability === 'available' ? 'offline' : 'unavailable',
        detail: this.#backend.availability === 'available'
          ? null
          : this.#snapshot.backend.detail,
        queuedFrameCount: 0,
        droppedFrameCount: 0,
        sentFrameCount: 0,
        lastReceivedTimestampMs: null,
      },
      recording: { state: 'idle', episodeId: null, command: null, acknowledgement: null, detail: null },
      hands: { left: emptyHandStatus(), right: emptyHandStatus() },
    };
    this.#emit();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    this.leaveCollector();
    this.#listeners.clear();
  }

  async #requestCommandSync(force = false): Promise<void> {
    this.#commandSyncRequested = true;
    if (this.#commandSyncRunning) return;
    this.#commandSyncRunning = true;
    try {
      do {
        this.#commandSyncRequested = false;
        const pairing = this.#pairing;
        if (pairing === null || this.#snapshot.backend.state !== 'live') continue;
        const state = await this.#backend.getCommandState(pairing);
        if (this.#pairing !== pairing) continue;
        await this.#applyCommandState(state, force);
        force = false;
      } while (this.#commandSyncRequested);
    } catch (reason) {
      this.#handleBackendFailure(reason);
    } finally {
      this.#commandSyncRunning = false;
    }
  }

  async #applyCommandState(state: QuestCollectorCommandState, force: boolean): Promise<void> {
    const pairing = this.#pairing;
    if (pairing === null || state.sessionId !== pairing.sessionId) return;
    if (state.activeEpisodeId !== null) {
      if (!force && state.activeEpisodeId === this.#lastCommandEpisodeId) return;
      if (this.#activeSession === null) {
        await this.#backend.acknowledge({
          sessionId: pairing.sessionId,
          episodeId: state.activeEpisodeId,
          sourceDeviceId: pairing.sourceDeviceId,
          command: 'start',
          state: 'rejected',
          detail: 'Quest immersive session이 실행 중이 아닙니다.',
        });
        this.#update({
          recording: {
            state: 'error',
            episodeId: state.activeEpisodeId,
            command: 'start',
            acknowledgement: 'rejected',
            detail: 'MR 모드에 먼저 진입하세요.',
          },
        });
        return;
      }
      this.#lastCommandEpisodeId = state.activeEpisodeId;
      this.#clearPreview();
      await this.#backend.acknowledge({
        sessionId: pairing.sessionId,
        episodeId: state.activeEpisodeId,
        sourceDeviceId: pairing.sourceDeviceId,
        command: 'start',
        state: 'acknowledged',
        detail: null,
      });
      await this.#backend.updatePresence(pairing, 'recording');
      this.#update({
        recording: {
          state: 'recording',
          episodeId: state.activeEpisodeId,
          command: 'start',
          acknowledgement: 'acknowledged',
          detail: null,
        },
      });
      return;
    }

    const previousEpisodeId = this.#lastCommandEpisodeId;
    if (previousEpisodeId === null) return;
    this.#clearFlushTimer();
    this.#clearPreview();
    this.#update({
      recording: {
        state: 'stopping',
        episodeId: previousEpisodeId,
        command: 'stop',
        acknowledgement: 'pending',
        detail: '남은 Hand Pose 원본을 전송하고 있습니다.',
      },
    });
    if (!await this.#drainFrames(pairing)) return;
    await this.#backend.acknowledge({
      sessionId: pairing.sessionId,
      episodeId: previousEpisodeId,
      sourceDeviceId: pairing.sourceDeviceId,
      command: 'stop',
      state: 'acknowledged',
      detail: null,
    });
    if (this.#pairing !== pairing) return;
    await this.#backend.updatePresence(pairing, this.#activeSession === null ? 'paired' : 'ready');
    if (this.#pairing !== pairing) return;
    this.#lastCommandEpisodeId = null;
    this.#update({
      recording: {
        state: 'review',
        episodeId: previousEpisodeId,
        command: 'stop',
        acknowledgement: 'acknowledged',
        detail: '원본 Hand Pose 전송을 마쳤습니다.',
      },
    });
  }

  #handleFrame(observation: WebXrFrameObservation): void {
    const nowMs = this.#nowMs();
    (['left', 'right'] as const).forEach((handedness) => {
      this.#snapshot = {
        ...this.#snapshot,
        hands: {
          ...this.#snapshot.hands,
          [handedness]: this.#nextHandStatus(handedness, observation.hands[handedness], nowMs),
        },
      };
    });
    const pairing = this.#pairing;
    const episodeId = this.#snapshot.recording.state === 'recording'
      ? this.#snapshot.recording.episodeId
      : null;
    if (pairing !== null && episodeId !== null && this.#queue !== null) {
      const frame: HandPoseFrame = {
        schemaVersion: 1,
        sessionId: pairing.sessionId,
        episodeId,
        sourceDeviceId: pairing.sourceDeviceId,
        sequence: this.#sequence,
        deviceMonotonicTimestampMs: observation.deviceMonotonicTimestampMs,
        clockDomain: 'webxr-dom-high-res-time',
        coordinateFrame: 'quest-local-floor',
        frameEpoch: this.#frameEpoch,
        hands: observation.hands,
      };
      this.#sequence = (this.#sequence + 1) >>> 0;
      this.#queue.enqueue(frame);
      this.#snapshot = {
        ...this.#snapshot,
        backend: {
          ...this.#snapshot.backend,
          queuedFrameCount: this.#queue.size,
          droppedFrameCount: this.#queue.droppedFrameCount,
        },
      };
      this.#scheduleFlush(pairing.policy.flushIntervalMs);
    } else if (pairing !== null && this.#snapshot.backend.state === 'live' && this.#previewAllowed()) {
      this.#latestPreviewObservation = observation;
      this.#schedulePreview();
    }
    this.#scheduleUiPublish();
  }

  #nextHandStatus(
    handedness: Handedness,
    observation: HandPoseObservation,
    nowMs: number,
  ): QuestHandStatus {
    if (observation.poseObserved) {
      const previous = this.#lastFrameAtMs[handedness];
      const instantaneousRate = previous === null || nowMs <= previous ? null : 1_000 / (nowMs - previous);
      const currentRate = this.#observedRateHz[handedness];
      const observedRateHz = instantaneousRate === null
        ? currentRate
        : currentRate === null ? instantaneousRate : currentRate * 0.8 + instantaneousRate * 0.2;
      this.#lastFrameAtMs[handedness] = nowMs;
      this.#missingSinceMs[handedness] = null;
      this.#observedRateHz[handedness] = observedRateHz;
      return {
        sourcePresent: observation.sourcePresent,
        poseObserved: true,
        qualityState: 'tracking',
        qualityBasis: 'profile-time-policy',
        validJointCount: 25,
        consecutiveMissingMs: 0,
        observedRateHz,
        lastObservedAtMs: nowMs,
      };
    }
    const missingSinceMs = this.#missingSinceMs[handedness] ?? nowMs;
    this.#missingSinceMs[handedness] = missingSinceMs;
    const consecutiveMissingMs = Math.max(0, nowMs - missingSinceMs);
    const lostAfterMs = this.#pairing?.policy.lostAfterMs ?? 1_500;
    return {
      sourcePresent: observation.sourcePresent,
      poseObserved: false,
      qualityState: consecutiveMissingMs >= lostAfterMs ? 'lost' : 'partial',
      qualityBasis: 'profile-time-policy',
      validJointCount: 0,
      consecutiveMissingMs,
      observedRateHz: this.#observedRateHz[handedness],
      lastObservedAtMs: this.#lastFrameAtMs[handedness],
    };
  }

  #scheduleFlush(delayMs: number): void {
    if (this.#flushTimer !== null || this.#flushPromise !== null) return;
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      void this.#flush();
    }, delayMs);
  }

  #schedulePreview(): void {
    if (this.#previewTimer !== null || this.#previewRunning) return;
    this.#previewTimer = setTimeout(() => {
      this.#previewTimer = null;
      void this.#publishPreview();
    }, 100);
  }

  async #publishPreview(): Promise<void> {
    const pairing = this.#pairing;
    const observation = this.#latestPreviewObservation;
    if (pairing === null || observation === null
      || this.#snapshot.backend.state !== 'live'
      || !this.#previewAllowed()) return;
    this.#latestPreviewObservation = null;
    this.#previewRunning = true;
    try {
      await this.#backend.sendHandPosePreview({ pairing, observation });
    } catch (reason) {
      this.#handleBackendFailure(reason);
    } finally {
      this.#previewRunning = false;
      if (this.#latestPreviewObservation !== null
        && this.#snapshot.backend.state === 'live'
        && this.#previewAllowed()) {
        this.#schedulePreview();
      }
    }
  }

  #previewAllowed(): boolean {
    return this.#snapshot.recording.state !== 'recording'
      && this.#snapshot.recording.state !== 'stopping';
  }

  async #drainFrames(pairing: QuestPairingResult): Promise<boolean> {
    while (this.#pairing === pairing && (this.#flushPromise !== null || (this.#queue?.size ?? 0) > 0)) {
      if (!await this.#flush()) return false;
    }
    return this.#pairing === pairing && this.#snapshot.backend.state === 'live';
  }

  #flush(): Promise<boolean> {
    if (this.#flushPromise !== null) return this.#flushPromise;
    const pairing = this.#pairing;
    const queue = this.#queue;
    if (pairing === null || queue === null || this.#snapshot.backend.state !== 'live') {
      return Promise.resolve(false);
    }
    if (queue.size === 0) return Promise.resolve(true);
    const flush = this.#sendBatch(pairing, queue).finally(() => {
      if (this.#flushPromise !== flush) return;
      this.#flushPromise = null;
      if (queue.size > 0 && this.#pairing === pairing && this.#snapshot.backend.state === 'live'
        && this.#snapshot.recording.state !== 'stopping') {
        this.#scheduleFlush(pairing.policy.flushIntervalMs);
      }
    });
    this.#flushPromise = flush;
    return flush;
  }

  async #sendBatch(pairing: QuestPairingResult, queue: HandPoseFrameQueue): Promise<boolean> {
    const frames = queue.take(pairing.policy.maximumBatchFrames);
    try {
      const payload = encodeHandPoseBatch(frames);
      const receipt = await this.#backend.sendHandPoseBatch({ pairing, frames, payload });
      if (this.#pairing !== pairing || this.#queue !== queue) return false;
      this.#snapshot = {
        ...this.#snapshot,
        backend: {
          ...this.#snapshot.backend,
          queuedFrameCount: queue.size,
          droppedFrameCount: queue.droppedFrameCount,
          sentFrameCount: this.#snapshot.backend.sentFrameCount + frames.length,
          lastReceivedTimestampMs: receipt.receivedTimestampMs,
        },
      };
      this.#scheduleUiPublish();
      return true;
    } catch (reason) {
      if (this.#pairing !== pairing || this.#queue !== queue) return false;
      queue.restoreFront(frames);
      this.#handleBackendFailure(reason);
      return false;
    }
  }

  #handleBackendFailure(reason: unknown): void {
    const detail = reason instanceof Error ? reason.message : 'Backend 연결이 중단되었습니다.';
    this.#update({
      backend: {
        ...this.#snapshot.backend,
        state: 'reconnecting',
        detail,
        queuedFrameCount: this.#queue?.size ?? 0,
        droppedFrameCount: this.#queue?.droppedFrameCount ?? 0,
      },
    });
    const pairing = this.#pairing;
    if (pairing !== null) void this.#backend.updatePresence(pairing, 'stale').catch(() => undefined);
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer !== null || this.#pairing === null) return;
    this.#reconnectAttempt += 1;
    const delayMs = Math.min(8_000, 500 * 2 ** Math.min(this.#reconnectAttempt - 1, 4));
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      void this.reconnectBackend().catch(() => undefined);
    }, delayMs);
  }

  #handleRuntimeEnded(): void {
    this.#activeSession = null;
    this.#clearFlushTimer();
    this.#clearPreview();
    const pairing = this.#pairing;
    if (pairing !== null) void this.#backend.updatePresence(pairing, 'offline').catch(() => undefined);
    this.#update({
      immersive: { state: 'idle', detail: 'WebXR session이 종료되었습니다.' },
      recording: this.#snapshot.recording.state === 'recording'
        ? { ...this.#snapshot.recording, state: 'error', detail: 'WebXR session 종료로 Hand Pose 수집만 중단되었습니다.' }
        : this.#snapshot.recording,
      hands: { left: emptyHandStatus(), right: emptyHandStatus() },
    });
  }

  #scheduleUiPublish(): void {
    if (this.#uiTimer !== null) return;
    this.#uiTimer = setTimeout(() => {
      this.#uiTimer = null;
      this.#emit();
    }, 250);
  }

  #clearFlushTimer(): void {
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
  }

  #clearPreview(): void {
    if (this.#previewTimer !== null) clearTimeout(this.#previewTimer);
    this.#previewTimer = null;
    this.#latestPreviewObservation = null;
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }

  #update(patch: Partial<QuestCollectorSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#emit();
  }

  #emit(): void {
    this.#listeners.forEach((listener) => listener());
  }
}
