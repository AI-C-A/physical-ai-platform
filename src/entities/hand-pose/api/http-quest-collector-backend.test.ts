import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuestCollectorAdapter } from './quest-collector-adapter';
import { HttpQuestCollectorBackend } from './http-quest-collector-backend';
import { SimulatedWebXrRuntime } from './simulated-webxr-runtime';

describe('HTTP Quest collector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('페어링 토큰을 사용해 프리뷰를 보내고 종료 후 전송을 멈춘다', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(Response.json(
      _url.endsWith('/pair') ? { sessionId: 'session-1', senderToken: 'sender-secret' }
        : _url.endsWith('/frames') ? { receivedTimestampMs: Date.now() }
          : init?.method === 'GET' ? { sessionId: 'session-1', sourceState: 'ready', frameCount: 0, frame: null }
            : { updated: true },
    )));
    vi.stubGlobal('fetch', fetcher);
    const backend = new HttpQuestCollectorBackend();
    const collector = new QuestCollectorAdapter({ backend, runtime: new SimulatedWebXrRuntime(), livePreview: backend });
    await collector.checkSupport();
    await collector.pair('123456');
    await collector.startImmersiveSession();
    await vi.advanceTimersByTimeAsync(400);
    const frames = fetcher.mock.calls.filter(([url]) => url.endsWith('/frames'));
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer sender-secret' });
    const payload = frames[0]?.[1]?.body;
    if (typeof payload !== 'string') throw new Error('JSON frame body가 필요합니다.');
    const body: unknown = JSON.parse(payload);
    expect(body).toMatchObject({ hands: { left: { poseObserved: true }, right: { poseObserved: true } } });
    expect(collector.getSnapshot()).toMatchObject({
      immersive: { state: 'running' }, backend: { state: 'live' }, recording: { state: 'idle' },
    });
    expect(collector.getSnapshot().backend.lastReceivedTimestampMs).not.toBeNull();
    await collector.endImmersiveSession();
    await vi.advanceTimersByTimeAsync(200);
    const countAfterEnd = fetcher.mock.calls.filter(([url]) => url.endsWith('/frames')).length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/frames'))).toHaveLength(countAfterEnd);
    collector.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('PC 읽기와 삭제는 보기 토큰만 사용하고 요청 취소를 전달한다', async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({})));
    vi.stubGlobal('fetch', fetcher);
    const backend = new HttpQuestCollectorBackend();
    const session = { sessionId: 'session-1', pairingCode: '123456', viewerToken: 'viewer-secret', expiresAtMs: 1, pairingExpiresAtMs: 1 };
    const controller = new AbortController();
    await backend.readSession(session, controller.signal);
    await backend.closeSession(session);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/quest/sessions/session-1', expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer viewer-secret' }) as unknown,
      signal: expect.any(AbortSignal) as unknown,
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/quest/sessions/session-1', expect.objectContaining({ method: 'DELETE', keepalive: true }));
    await expect(backend.sendHandPoseBatch()).rejects.toThrow('원본 저장');
  });

  it('오류 응답을 연결 성공으로 처리하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ message: '연결 코드가 만료되었습니다.' }, { status: 404 }))));
    await expect(new HttpQuestCollectorBackend().pair('123456')).rejects.toThrow('연결 코드가 만료');
  });
});
