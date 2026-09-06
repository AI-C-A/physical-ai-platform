import { afterEach, expect, it, vi } from 'vitest';

import { HttpQuestCollectorBackend } from './http-quest-collector-backend';

afterEach(() => vi.unstubAllGlobals());

it('종료 통지를 보내기 전에 진행 중인 손 프레임 전송을 마친다', async () => {
  let finishFrame: ((response: Response) => void) | undefined;
  const fetcher = vi.fn((url: string) => {
    if (url.endsWith('/pair')) return Promise.resolve(Response.json({ sessionId: 'session-1', senderToken: 'sender-secret' }));
    if (url.endsWith('/frames')) return new Promise<Response>((resolve) => { finishFrame = resolve; });
    return Promise.resolve(Response.json({ updated: true }));
  });
  vi.stubGlobal('fetch', fetcher);
  const backend = new HttpQuestCollectorBackend();
  const pairing = await backend.pair('123456');
  const preview = backend.sendHandPosePreview({ pairing, observation: {
    deviceMonotonicTimestampMs: 0,
    hands: {
      left: { sourcePresent: false, poseObserved: false, joints: [] },
      right: { sourcePresent: false, poseObserved: false, joints: [] },
    },
  } });
  const ending = backend.updatePresence(pairing, 'offline');
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/presence'))).toHaveLength(0);
  finishFrame?.(Response.json({ receivedTimestampMs: 123 }));
  await preview;
  await ending;
  expect(fetcher).toHaveBeenLastCalledWith('/api/quest/sessions/session-1/presence', expect.objectContaining({ body: '{"state":"offline"}' }));
});
