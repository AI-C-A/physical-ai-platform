import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QuestLivePreviewPort, QuestLiveSnapshot } from '@/entities/hand-pose';
import { useQuestLiveMonitor } from './use-quest-live-monitor';

const session = { sessionId: 'live-session', viewerToken: 'secret', pairingCode: '123456', expiresAtMs: 99_999, pairingExpiresAtMs: 10_000 };
const snapshot: QuestLiveSnapshot = { sessionId: session.sessionId, sourceState: 'paired', frame: null, frameCount: 0 };

function createPort() {
  return {
    createSession: vi.fn(() => Promise.resolve(session)),
    readSession: vi.fn<QuestLivePreviewPort['readSession']>(() => Promise.resolve(snapshot)),
    closeSession: vi.fn(() => Promise.resolve()),
  };
}

describe('PC 손 추적 모니터 연결 수명', () => {
  afterEach(() => vi.useRealTimers());

  it('한 번에 한 요청만 진행하고 수신 실패 시 이전 프레임을 지우며 재연결한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const port = createPort();
    const { result, unmount } = renderHook(() => useQuestLiveMonitor(port));
    await act(() => result.current.create());
    expect(result.current.snapshot).toEqual(snapshot);
    port.readSession.mockRejectedValueOnce(new Error('offline'));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.snapshot).toBeNull();
    expect(result.current.error).toContain('자동으로 다시 연결');
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(result.current.snapshot).toEqual(snapshot);
    expect(result.current.error).toBeNull();
    let finish: ((value: QuestLiveSnapshot) => void) | undefined;
    port.readSession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    const count = port.readSession.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(port.readSession).toHaveBeenCalledTimes(count);
    const signal = port.readSession.mock.calls.at(-1)?.[1];
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(port.closeSession).toHaveBeenCalledWith(session);
    await act(async () => {
      finish?.(snapshot);
      await Promise.resolve();
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('화면을 떠난 뒤 생성이 완료되면 새 세션도 바로 해제한다', async () => {
    const port = createPort();
    let finish: ((value: typeof session) => void) | undefined;
    port.createSession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result, unmount } = renderHook(() => useQuestLiveMonitor(port));
    let creating: Promise<void> | undefined;
    act(() => { creating = result.current.create(); });
    unmount();
    finish?.(session);
    await creating;
    expect(port.closeSession).toHaveBeenCalledWith(session);
    expect(port.readSession).not.toHaveBeenCalled();
  });
});
