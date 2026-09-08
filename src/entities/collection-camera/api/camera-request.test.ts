import { afterEach, expect, it, vi } from 'vitest';
import { cameraRequest } from './camera-request';

afterEach(() => vi.unstubAllGlobals());

it.each([null, {}, { id: 'camera', role: 'unknown', label: 'Head', senderToken: 'sender' }])('잘못된 페어링 응답을 거부한다: %j', async (value) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(value) }));
  await expect(cameraRequest('/pair', undefined, 'POST', {})).rejects.toThrow('응답 형식');
});

it('잘못된 SDP나 ICE 설정을 연결 구현에 넘기지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({
    id: 'camera', revision: 1, paired: true, peerOnline: true, offer: { type: 'answer', sdp: 'v=0' }, answer: null, iceServers: [],
  }) }));
  await expect(cameraRequest('/camera', 'viewer')).rejects.toThrow('응답 형식');
});

it('유효한 페어링 결과를 반환하고 문자열 오류 메시지만 사용한다', async () => {
  const value = { id: 'camera', role: 'head', label: 'Head', senderToken: 'sender' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(value) })
    .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ message: {} }) }));
  await expect(cameraRequest('/pair', undefined, 'POST', {})).resolves.toEqual(value);
  await expect(cameraRequest('/pair', undefined, 'POST', {})).rejects.toThrow('연결 요청에 실패');
});
