import {
  systemScheduler,
  type Scheduler,
  type SchedulerTimer,
} from '@/shared/lib/scheduler';
import { createPageResult } from '@/shared/lib/query';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { CaptureOperationsPort, CaptureSessionQuery } from '../model/capture-operations';
import type {
  CaptureSession,
  CaptureSessionEvent,
  CaptureSessionStatus,
  CaptureValidationResult,
  CreateCaptureSessionInput,
} from '../model/capture-session';

export type InMemoryCaptureScenario =
  | 'success'
  | 'preflight-failure'
  | 'recording-interruption'
  | 'processing-failure';

interface InMemoryCaptureOptions {
  readonly scheduler?: Scheduler;
  readonly scenario?: InMemoryCaptureScenario;
  readonly createId?: (kind: 'session' | 'episode', sequence: number) => string;
  readonly initialSessions?: readonly CaptureSession[];
}

interface CaptureState { readonly sessions: readonly CaptureSession[] }

interface PendingDelay {
  readonly timer: SchedulerTimer;
  readonly settle: (active: boolean) => void;
}

const validationDurationMs = 300;
const startingDurationMs = 300;
const stoppingDurationMs = 250;
const finalizingDurationMs = 350;
const processingDurationMs = 400;
const recordingUpdateIntervalMs = 250;
const interruptionAfterMs = 750;

function defaultCreateId(
  kind: 'session' | 'episode',
  sequence: number,
): string {
  return `${kind}-${String(sequence).padStart(4, '0')}`;
}

export class InMemoryCaptureOperationsAdapter
  implements CaptureOperationsPort
{
  readonly #scheduler: Scheduler;
  readonly #scenario: InMemoryCaptureScenario;
  readonly #createId: (
    kind: 'session' | 'episode',
    sequence: number,
  ) => string;
  readonly #store: StoreApi<CaptureState>;
  readonly #listenersBySession = new Map<
    string,
    Set<(event: CaptureSessionEvent) => void>
  >();
  readonly #recordingTimers = new Map<string, SchedulerTimer>();
  readonly #interruptionTimers = new Map<string, SchedulerTimer>();
  readonly #pendingDelays = new Set<PendingDelay>();
  readonly #storeUnsubscribers = new Set<() => void>();
  #sessionSequence = 0;
  #episodeSequence = 0;
  #disposed = false;

  constructor(options: InMemoryCaptureOptions = {}) {
    options.initialSessions?.forEach((session) => {
      if (
        session.status === 'completed'
        && (
          session.startedAtMs === null
          || session.stoppedAtMs === null
          || session.completedAtMs === null
          || session.stoppedAtMs < session.startedAtMs
          || session.completedAtMs < session.stoppedAtMs
        )
      ) {
        throw new Error(
          `완료된 in-memory 수집 세션의 시간 정보가 올바르지 않습니다: ${session.id}`,
        );
      }
    });
    this.#scheduler = options.scheduler ?? systemScheduler;
    this.#scenario = options.scenario ?? 'success';
    this.#createId = options.createId ?? defaultCreateId;
    this.#store = createStore(() => ({ sessions: options.initialSessions ?? [] }));
    this.#sessionSequence = options.initialSessions?.length ?? 0;
    this.#episodeSequence = options.initialSessions?.filter(
      (session) => session.episodeId !== null,
    ).length ?? 0;
  }

  listSessions(): Promise<readonly CaptureSession[]> {
    return Promise.resolve(this.#listSessions());
  }

  querySessions(query: CaptureSessionQuery) {
    const search = query.search.trim().toLocaleLowerCase();
    const filtered = this.#listSessions().filter(
      (session) =>
        (session.name.toLocaleLowerCase().includes(search)
          || session.id.toLocaleLowerCase().includes(search)) &&
        (query.status === null || session.status === query.status) &&
        (query.robotId === null || session.robotId === query.robotId) &&
        (query.environment === null || session.provenance.environment === query.environment) &&
        (query.deliveryMode === null || session.provenance.deliveryMode === query.deliveryMode) &&
        (query.startMs === null || session.createdAtMs >= query.startMs),
    );
    const sorted = [...filtered].sort((left, right) => {
      const primary = query.sort === 'oldest'
        ? left.createdAtMs - right.createdAtMs
        : query.sort === 'name-asc'
          ? left.name.localeCompare(right.name, 'ko')
          : query.sort === 'bytes-desc'
            ? right.bytesWritten - left.bytesWritten
            : right.createdAtMs - left.createdAtMs;
      return primary === 0 ? left.id.localeCompare(right.id) : primary;
    });
    return Promise.resolve(createPageResult(sorted, query));
  }

  getSession(sessionId: string): Promise<CaptureSession | null> {
    return Promise.resolve(this.#findSession(sessionId));
  }

  getPlanOptions() {
    return Promise.resolve({
      // 실제 기록 대상은 Composition에서 현재 연결된 데이터 Adapter를 조회해 채운다.
      streams: [],
      environments: ['physical', 'simulation'] as const,
      deliveryModes: ['live', 'replay'] as const,
      dataOrigins: ['captured', 'synthetic', 'derived'] as const,
      controlModes: ['autonomous', 'teleop', 'manual', 'mixed'] as const,
    });
  }

  async createSession(input: CreateCaptureSessionInput): Promise<CaptureSession> {
    await Promise.resolve();
    this.#assertActive();
    const sessionId = this.#nextId('session');
    const session: CaptureSession = {
      id: sessionId,
      name: input.name,
      robotId: input.robotId,
      sensorDeviceId: input.sensorDeviceId,
      integrationProfileId: input.integrationProfileId,
      provenance: input.provenance,
      status: 'draft',
      createdAtMs: this.#scheduler.now(),
      startedAtMs: null,
      stoppedAtMs: null,
      completedAtMs: null,
      bytesWritten: 0,
      streams: input.streams.map((stream) => ({
        ...stream,
        state: 'waiting',
        observedRateHz: null,
        bytesWritten: 0,
        lastReceivedTimestampMs: null,
      })),
      episodeId: null,
      lastError: null,
      preflight: null,
      statusHistory: [{ status: 'draft', occurredAtMs: this.#scheduler.now() }],
    };
    this.#store.setState((state) => ({ sessions: [session, ...state.sessions] }));
    this.#emit(session);
    return session;
  }

  async validateSession(
    sessionId: string,
  ): Promise<CaptureValidationResult> {
    this.#assertActive();
    this.#assertStatus(sessionId, ['draft']);
    this.#transition(sessionId, 'validating');
    if (!(await this.#delay(validationDurationMs))) {
      throw new Error('종료된 Capture Adapter의 사전 점검을 완료하지 않았습니다.');
    }

    const failed = this.#scenario === 'preflight-failure';
    const result: CaptureValidationResult = {
      passed: !failed,
      checks: [
        {
          id: 'robot-selected',
          label: '로봇 선택',
          state: 'passed',
          detail: '로봇 식별자가 설정되었습니다.',
        },
        {
          id: 'sensor-rig-selected',
          label: '센서 리그 선택',
          state: 'passed',
          detail: '독립 센서 장치 식별자가 설정되었습니다.',
        },
        {
          id: 'collector-ready',
          label: '수집 처리 준비',
          state: failed ? 'failed' : 'passed',
          detail: failed
            ? '수집 처리 준비 상태를 확인하지 못했습니다.'
            : '수집 처리 구성과 기록 대상이 준비되었습니다.',
        },
      ],
    };

    if (failed) {
      this.#updateSession(sessionId, (session) => ({ ...session, preflight: result }));
      this.#transition(
        sessionId,
        'failed',
        '사전 점검에 실패했습니다.',
      );
    } else {
      this.#updateSession(sessionId, (session) => ({ ...session, preflight: result }));
      this.#transition(sessionId, 'ready');
    }

    return result;
  }

  async startSession(sessionId: string): Promise<void> {
    this.#assertActive();
    this.#assertStatus(sessionId, ['ready']);
    const target = this.#getSession(sessionId);
    const conflict = this.#listSessions().some(
      (session) =>
        session.id !== sessionId &&
        session.robotId === target.robotId &&
        (session.status === 'starting' || session.status === 'recording'),
    );
    if (conflict) {
      throw new Error('같은 로봇에서 이미 기록 중인 수집 세션이 있습니다.');
    }
    this.#transition(sessionId, 'starting');
    if (!(await this.#delay(startingDurationMs))) {
      throw new Error('종료된 Capture Adapter의 기록 시작을 완료하지 않았습니다.');
    }
    this.#updateSession(sessionId, (session) => ({
      ...session,
      status: 'recording',
      startedAtMs: this.#scheduler.now(),
      streams: session.streams.map((stream) => ({
        ...stream,
        state: 'active',
        observedRateHz: stream.expectedRateHz,
        lastReceivedTimestampMs: this.#scheduler.now(),
      })),
    }));
    this.#startRecordingProgress(sessionId);

    if (this.#scenario === 'recording-interruption') {
      const timer = this.#scheduler.setTimeout(() => {
        this.#stopRecordingProgress(sessionId);
        this.#updateSession(sessionId, (session) => ({
          ...session,
          status: 'interrupted',
          stoppedAtMs: this.#scheduler.now(),
          lastError: '기록 중 스트림 수신이 중단되었습니다.',
          streams: session.streams.map((stream) => ({
            ...stream,
            state: 'stale',
          })),
        }));
      }, interruptionAfterMs);
      this.#interruptionTimers.set(sessionId, timer);
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    this.#assertActive();
    this.#assertStatus(sessionId, ['recording']);
    this.#stopRecordingProgress(sessionId);
    this.#transition(sessionId, 'stopping');
    if (!(await this.#delay(stoppingDurationMs))) {
      throw new Error('종료된 Capture Adapter의 기록 중지를 완료하지 않았습니다.');
    }
    this.#updateSession(sessionId, (session) => ({
      ...session,
      status: 'finalizing',
      stoppedAtMs: this.#scheduler.now(),
      streams: session.streams.map((stream) => ({
        ...stream,
        state: 'stopped',
      })),
    }));
    if (!(await this.#delay(finalizingDurationMs))) {
      throw new Error('종료된 Capture Adapter의 기록 마감을 완료하지 않았습니다.');
    }
    this.#transition(sessionId, 'processing');
    if (!(await this.#delay(processingDurationMs))) {
      throw new Error('종료된 Capture Adapter의 후처리를 완료하지 않았습니다.');
    }

    if (this.#scenario === 'processing-failure') {
      this.#transition(
        sessionId,
        'failed',
        '후처리 단계에 실패했습니다.',
      );
      return;
    }

    const episodeId = this.#nextId('episode');
    this.#updateSession(sessionId, (session) => ({
      ...session,
      status: 'completed',
      completedAtMs: this.#scheduler.now(),
      episodeId,
    }));
  }

  subscribeSession(
    sessionId: string,
    listener: (event: CaptureSessionEvent) => void,
  ): () => void {
    this.#assertActive();
    const listeners = this.#listenersBySession.get(sessionId) ?? new Set();
    listeners.add(listener);
    this.#listenersBySession.set(sessionId, listeners);
    const session = this.#findSession(sessionId);

    if (session !== null) {
      try {
        listener({ session, occurredAtMs: this.#scheduler.now() });
      } catch (error: unknown) {
        listeners.delete(listener);
        if (listeners.size === 0) this.#listenersBySession.delete(sessionId);
        throw error;
      }
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listenersBySession.delete(sessionId);
    };
  }

  subscribeSessions(listener: () => void): () => void {
    this.#assertActive();
    const unsubscribeStore = this.#store.subscribe(listener);
    const unsubscribe = (): void => {
      if (!this.#storeUnsubscribers.delete(unsubscribe)) return;
      unsubscribeStore();
    };
    this.#storeUnsubscribers.add(unsubscribe);
    return unsubscribe;
  }

  /** Composition Root가 소유한 timer와 listener를 애플리케이션 종료 시 함께 정리한다. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    [...this.#recordingTimers.keys()].forEach((sessionId) => {
      this.#stopRecordingProgress(sessionId);
    });
    [...this.#pendingDelays].forEach((pending) => {
      this.#scheduler.clearTimeout(pending.timer);
      this.#pendingDelays.delete(pending);
      pending.settle(false);
    });
    [...this.#storeUnsubscribers].forEach((unsubscribe) => unsubscribe());
    this.#listenersBySession.clear();
  }

  #startRecordingProgress(sessionId: string): void {
    this.#assertActive();
    const timer = this.#scheduler.setInterval(() => {
      this.#updateSession(sessionId, (session) => {
        const nowMs = this.#scheduler.now();
        const streams = session.streams.map((stream, index) => {
          const bytesIncrement = (index + 1) * 128 * 1024;
          return {
            ...stream,
            observedRateHz: stream.expectedRateHz,
            bytesWritten: stream.bytesWritten + bytesIncrement,
            lastReceivedTimestampMs: nowMs,
          };
        });
        return {
          ...session,
          bytesWritten: streams.reduce(
            (total, stream) => total + stream.bytesWritten,
            0,
          ),
          streams,
        };
      });
    }, recordingUpdateIntervalMs);
    this.#recordingTimers.set(sessionId, timer);
  }

  #stopRecordingProgress(sessionId: string): void {
    const recordingTimer = this.#recordingTimers.get(sessionId);
    if (recordingTimer !== undefined) {
      this.#scheduler.clearInterval(recordingTimer);
      this.#recordingTimers.delete(sessionId);
    }

    const interruptionTimer = this.#interruptionTimers.get(sessionId);
    if (interruptionTimer !== undefined) {
      this.#scheduler.clearTimeout(interruptionTimer);
      this.#interruptionTimers.delete(sessionId);
    }
  }

  #transition(
    sessionId: string,
    status: CaptureSessionStatus,
    lastError: string | null = null,
  ): void {
    this.#updateSession(sessionId, (session) => ({
      ...session,
      status,
      lastError,
    }));
  }

  #updateSession(
    sessionId: string,
    update: (session: CaptureSession) => CaptureSession,
  ): void {
    const current = this.#getSession(sessionId);
    const candidate = update(current);
    const next = candidate.status === current.status
      ? candidate
      : {
          ...candidate,
          statusHistory: [
            ...candidate.statusHistory,
            { status: candidate.status, occurredAtMs: this.#scheduler.now() },
          ],
        };
    this.#store.setState((state) => ({
      sessions: state.sessions.map((session) => session.id === sessionId ? next : session),
    }));
    this.#emit(next);
  }

  #emit(session: CaptureSession): void {
    const event: CaptureSessionEvent = {
      session,
      occurredAtMs: this.#scheduler.now(),
    };
    this.#listenersBySession
      .get(session.id)
      ?.forEach((listener) => listener(event));
  }

  #assertStatus(
    sessionId: string,
    allowedStatuses: readonly CaptureSessionStatus[],
  ): void {
    const session = this.#getSession(sessionId);
    if (!allowedStatuses.includes(session.status)) {
      throw new Error(
        `${session.status} 상태에서는 요청한 수집 작업을 수행할 수 없습니다.`,
      );
    }
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('종료된 Capture Adapter는 사용할 수 없습니다.');
    }
  }

  #delay(durationMs: number): Promise<boolean> {
    if (this.#disposed) return Promise.resolve(false);

    return new Promise((settle) => {
      const pending: PendingDelay = {
        timer: this.#scheduler.setTimeout(() => {
          this.#pendingDelays.delete(pending);
          settle(!this.#disposed);
        }, durationMs),
        settle,
      };
      this.#pendingDelays.add(pending);
    });
  }

  #getSession(sessionId: string): CaptureSession {
    const session = this.#findSession(sessionId);
    if (session === null) {
      throw new Error(`수집 세션을 찾을 수 없습니다: ${sessionId}`);
    }
    return session;
  }

  #listSessions(): readonly CaptureSession[] {
    return this.#store.getState().sessions;
  }

  #findSession(sessionId: string): CaptureSession | null {
    return this.#listSessions().find((session) => session.id === sessionId) ?? null;
  }

  #nextId(kind: 'session' | 'episode'): string {
    const usedIds = new Set(
      kind === 'session'
        ? this.#listSessions().map((session) => session.id)
        : this.#listSessions().flatMap((session) =>
            session.episodeId === null ? [] : [session.episodeId],
          ),
    );
    const maximumAttempts = usedIds.size + 1;

    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      const sequence = kind === 'session'
        ? (this.#sessionSequence += 1)
        : (this.#episodeSequence += 1);
      const candidate = this.#createId(kind, sequence);
      if (candidate.trim().length > 0 && !usedIds.has(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `고유한 ${kind === 'session' ? '수집 세션' : '에피소드'} ID를 생성하지 못했습니다.`,
    );
  }
}
