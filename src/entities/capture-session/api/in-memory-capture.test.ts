import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CaptureSession,
  CreateCaptureSessionInput,
} from '../model/capture-session';
import { InMemoryCaptureOperationsAdapter } from './in-memory-capture';

const createInput: CreateCaptureSessionInput = {
  name: 'Capture 상태 전이 검사',
  robotId: 'robot-1',
  sensorDeviceId: 'sensor-rig-1',
  integrationProfileId: 'profile-v1',
  provenance: {
    environment: 'simulation',
    deliveryMode: 'live',
    controlMode: 'autonomous',
    dataOrigin: 'synthetic',
  },
  streams: [
    { id: 'pose', displayName: 'Pose', expectedRateHz: 20 },
    { id: 'battery', displayName: 'Battery', expectedRateHz: 1 },
  ],
};

function createStoredSession(
  id: string,
  overrides: Partial<CaptureSession> = {},
): CaptureSession {
  return {
    id,
    name: '공통 Capture',
    robotId: 'robot-1',
    sensorDeviceId: 'sensor-rig-1',
    integrationProfileId: 'profile-v1',
    provenance: createInput.provenance,
    status: 'completed',
    createdAtMs: 1_000,
    startedAtMs: 1_100,
    stoppedAtMs: 1_200,
    completedAtMs: 1_300,
    bytesWritten: 1_000,
    streams: [],
    episodeId: `episode-${id}`,
    lastError: null,
    preflight: null,
    statusHistory: [{ status: 'completed', occurredAtMs: 1_300 }],
    ...overrides,
  };
}

describe('InMemoryCaptureOperationsAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('완료 상태의 누락·역전 시간을 시작 시점에 거부한다', () => {
    const invalidCompleted: CaptureSession = {
      id: 'session-invalid',
      name: '잘못된 완료 세션',
      robotId: createInput.robotId,
      sensorDeviceId: createInput.sensorDeviceId,
      integrationProfileId: createInput.integrationProfileId,
      provenance: createInput.provenance,
      status: 'completed',
      createdAtMs: 100,
      startedAtMs: null,
      stoppedAtMs: null,
      completedAtMs: null,
      bytesWritten: 0,
      streams: [],
      episodeId: null,
      lastError: null,
      preflight: null,
      statusHistory: [{ status: 'completed', occurredAtMs: 100 }],
    };

    expect(() => new InMemoryCaptureOperationsAdapter({
      initialSessions: [invalidCompleted],
    })).toThrow('시간 정보가 올바르지 않습니다: session-invalid');
  });

  it('검색·상태·provenance·기간 필터와 정렬·페이지를 같은 결과 집합에 적용한다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter({
      initialSessions: [
        createStoredSession('session-b'),
        createStoredSession('session-a', { bytesWritten: 2_000 }),
        createStoredSession('session-c', {
          name: '다른 Capture',
          robotId: 'robot-2',
          provenance: {
            environment: 'physical',
            deliveryMode: 'live',
            controlMode: 'teleop',
            dataOrigin: 'captured',
          },
          createdAtMs: 2_000,
          startedAtMs: 2_100,
          stoppedAtMs: 2_200,
          completedAtMs: 2_300,
        }),
      ],
    });
    const baseQuery = {
      search: '  공통  ',
      status: 'completed' as const,
      robotId: 'robot-1',
      environment: 'simulation' as const,
      deliveryMode: 'live' as const,
      startMs: 900,
      sort: 'newest' as const,
      pageSize: 1,
    };

    const firstPage = await adapter.querySessions({ ...baseQuery, page: 1 });
    const secondPage = await adapter.querySessions({ ...baseQuery, page: 2 });

    expect(firstPage).toMatchObject({ totalItems: 2, totalPages: 2, page: 1 });
    expect(firstPage.items.map((session) => session.id)).toEqual(['session-a']);
    expect(secondPage.items.map((session) => session.id)).toEqual(['session-b']);

    const byBytes = await adapter.querySessions({
      ...baseQuery,
      page: 1,
      pageSize: 20,
      sort: 'bytes-desc',
    });
    expect(byBytes.items.map((session) => session.id)).toEqual([
      'session-a',
      'session-b',
    ]);

    await expect(adapter.querySessions({
      ...baseQuery,
      search: ' SESSION-B ',
      page: 1,
      pageSize: 20,
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'session-b' })],
      totalItems: 1,
    });
  });

  it('초기 세션·에피소드와 충돌하지 않는 내부 ID를 생성한다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter({
      initialSessions: [
        createStoredSession('session-0002', {
          episodeId: 'episode-0002',
        }),
      ],
    });
    const invalidated = vi.fn();
    const unsubscribe = adapter.subscribeSessions(invalidated);
    const created = await adapter.createSession(createInput);

    expect(created.id).toBe('session-0003');
    expect(invalidated).toHaveBeenCalledOnce();

    const validation = adapter.validateSession(created.id);
    await vi.advanceTimersByTimeAsync(300);
    await validation;
    const start = adapter.startSession(created.id);
    await vi.advanceTimersByTimeAsync(300);
    await start;
    const stop = adapter.stopSession(created.id);
    await vi.advanceTimersByTimeAsync(1_000);
    await stop;

    const completed = await adapter.getSession(created.id);
    expect(completed).toMatchObject({
      id: 'session-0003',
      episodeId: 'episode-0003',
      status: 'completed',
    });
    const sessions = await adapter.listSessions();
    expect(new Set(sessions.map((session) => session.id)).size).toBe(
      sessions.length,
    );
    expect(
      new Set(
        sessions.flatMap((session) =>
          session.episodeId === null ? [] : [session.episodeId],
        ),
      ).size,
    ).toBe(2);
    unsubscribe();
  });

  it('정상 Capture를 completed와 Episode 생성까지 전이한다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter();
    const session = await adapter.createSession(createInput);
    const statuses: CaptureSession['status'][] = [];
    let latestSession = session;
    adapter.subscribeSession(session.id, (event) => {
      statuses.push(event.session.status);
      latestSession = event.session;
    });

    const validationPromise = adapter.validateSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    const validation = await validationPromise;
    expect(validation.passed).toBe(true);

    const startPromise = adapter.startSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await startPromise;
    await vi.advanceTimersByTimeAsync(500);
    expect(latestSession.bytesWritten).toBeGreaterThan(0);

    const stopPromise = adapter.stopSession(session.id);
    await vi.advanceTimersByTimeAsync(1000);
    await stopPromise;

    expect(statuses).toEqual(
      expect.arrayContaining([
        'draft',
        'validating',
        'ready',
        'starting',
        'recording',
        'stopping',
        'finalizing',
        'processing',
        'completed',
      ]),
    );
    expect(latestSession.status).toBe('completed');
    expect(latestSession.episodeId).toBe('episode-0001');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Preflight 실패 시 failed 상태와 실패 check를 반환한다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter({
      scenario: 'preflight-failure',
    });
    const session = await adapter.createSession(createInput);
    let latestSession = session;
    adapter.subscribeSession(session.id, (event) => {
      latestSession = event.session;
    });

    const validationPromise = adapter.validateSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    const validation = await validationPromise;

    expect(validation.passed).toBe(false);
    expect(validation.checks.some((check) => check.state === 'failed')).toBe(
      true,
    );
    expect(latestSession.status).toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Recording 중단 시 interrupted 상태를 알린다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter({
      scenario: 'recording-interruption',
    });
    const session = await adapter.createSession(createInput);
    let latestSession = session;
    adapter.subscribeSession(session.id, (event) => {
      latestSession = event.session;
    });

    const validationPromise = adapter.validateSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await validationPromise;
    const startPromise = adapter.startSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await startPromise;
    await vi.advanceTimersByTimeAsync(750);

    expect(latestSession.status).toBe('interrupted');
    expect(latestSession.lastError).toContain('중단');
    expect(latestSession.stoppedAtMs).toBe(1350);
    expect(latestSession.streams.every((stream) => stream.state === 'stale')).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Processing 실패 시 Episode 없이 failed 상태로 끝난다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter({
      scenario: 'processing-failure',
    });
    const session = await adapter.createSession(createInput);
    let latestSession = session;
    adapter.subscribeSession(session.id, (event) => {
      latestSession = event.session;
    });

    const validationPromise = adapter.validateSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await validationPromise;
    const startPromise = adapter.startSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await startPromise;
    const stopPromise = adapter.stopSession(session.id);
    await vi.advanceTimersByTimeAsync(1000);
    await stopPromise;

    expect(latestSession.status).toBe('failed');
    expect(latestSession.lastError).toContain('후처리');
    expect(latestSession.episodeId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('같은 로봇에서는 동시에 하나의 세션만 기록을 시작한다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter();
    const first = await adapter.createSession(createInput);
    const second = await adapter.createSession({
      ...createInput,
      name: '동시성 검사 Session',
    });

    const firstValidation = adapter.validateSession(first.id);
    await vi.advanceTimersByTimeAsync(300);
    await firstValidation;
    const secondValidation = adapter.validateSession(second.id);
    await vi.advanceTimersByTimeAsync(300);
    await secondValidation;

    const firstStart = adapter.startSession(first.id);
    await vi.advanceTimersByTimeAsync(300);
    await firstStart;

    await expect(adapter.startSession(second.id)).rejects.toThrow(
      '같은 로봇',
    );
    expect((await adapter.getSession(second.id))?.status).toBe('ready');

    const stop = adapter.stopSession(first.id);
    await vi.advanceTimersByTimeAsync(1000);
    await stop;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('화면 구독이 해제되어도 app scope recording 진행은 유지한다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter();
    const session = await adapter.createSession(createInput);
    const unsubscribe = adapter.subscribeSession(session.id, vi.fn());
    const validation = adapter.validateSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await validation;
    const start = adapter.startSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await start;

    unsubscribe();
    await vi.advanceTimersByTimeAsync(500);

    expect((await adapter.getSession(session.id))?.status).toBe('recording');
    expect((await adapter.getSession(session.id))?.bytesWritten).toBeGreaterThan(0);
    expect(vi.getTimerCount()).toBe(1);

    const stop = adapter.stopSession(session.id);
    await vi.advanceTimersByTimeAsync(1000);
    await stop;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('초기 Session listener가 실패하면 부분 구독을 남기지 않는다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter();
    const session = await adapter.createSession(createInput);
    const listener = vi.fn(() => {
      throw new Error('초기 Session listener 실패');
    });

    expect(() => adapter.subscribeSession(session.id, listener)).toThrow(
      '초기 Session listener 실패',
    );

    const validation = adapter.validateSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await validation;

    expect(listener).toHaveBeenCalledOnce();
  });

  it('dispose에서 recording timer와 listener를 정리한다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter();
    const session = await adapter.createSession(createInput);
    const listener = vi.fn();
    adapter.subscribeSession(session.id, listener);
    const validation = adapter.validateSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await validation;
    const start = adapter.startSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await start;
    await vi.advanceTimersByTimeAsync(250);
    const bytesAtDispose = (await adapter.getSession(session.id))?.bytesWritten;

    adapter.dispose();
    adapter.dispose();
    expect(vi.getTimerCount()).toBe(0);
    const callsAtDispose = listener.mock.calls.length;

    await vi.advanceTimersByTimeAsync(2_000);
    expect((await adapter.getSession(session.id))?.bytesWritten).toBe(bytesAtDispose);
    expect(listener).toHaveBeenCalledTimes(callsAtDispose);
    await expect(adapter.createSession(createInput)).rejects.toThrow(
      '종료된 Capture Adapter',
    );
  });

  it('dispose에서 지연 중인 상태 전이를 취소하고 Promise를 종료한다', async () => {
    const adapter = new InMemoryCaptureOperationsAdapter();
    const session = await adapter.createSession(createInput);
    const validation = adapter.validateSession(session.id);

    adapter.dispose();

    await expect(validation).rejects.toThrow('사전 점검을 완료하지 않았습니다');
    expect(vi.getTimerCount()).toBe(0);
    expect((await adapter.getSession(session.id))?.status).toBe('validating');
  });
});
