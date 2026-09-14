import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockCameraRequest } from './mock-camera-request';
import type { CameraBinding, CameraSender, CameraSignal } from '../model/camera';
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000); });
afterEach(() => { localStorage.clear(); vi.useRealTimers(); });
const create = () => mockCameraRequest('', 'mock-owner-session', 'POST', { collectionId: 'session', role: 'head', label: '헤드캠 1' }) as Promise<CameraBinding>;
it('발급부터 5분 뒤 만료되고 명시적 재발급만 시간을 초기화한다', async () => {
  const camera = await create();
  expect(camera.paired).toBe(false);
  expect(camera.pairingExpiresAtMs - Date.now()).toBe(300_000);
  vi.setSystemTime(Date.now() + 300_000);
  await expect(mockCameraRequest('/pair', undefined, 'POST', { pairingCode: camera.pairingCode })).rejects.toThrow('연결 코드');
  const renewed = await mockCameraRequest(`/${camera.id}/refresh-code`, camera.viewerToken, 'POST', { restart: true }) as CameraBinding;
  expect(renewed.pairingCode).not.toBe(camera.pairingCode);
  expect(renewed.pairingExpiresAtMs - Date.now()).toBe(300_000);
});
it('코드 발급과 연결을 구별하고 실제 peer가 사용하는 SDP와 재발급 경합을 처리한다', async () => {
  const camera = await create();
  const signal = () => mockCameraRequest(`/${camera.id}`, camera.viewerToken, 'GET', undefined) as Promise<CameraSignal>;
  expect((await signal()).paired).toBe(false);
  const sender = await mockCameraRequest('/pair', undefined, 'POST', { pairingCode: camera.pairingCode }) as CameraSender;
  expect((await signal()).paired).toBe(true);
  const raced = await mockCameraRequest(`/${camera.id}/refresh-code`, camera.viewerToken, 'POST', { restart: true }) as CameraBinding;
  expect(raced).toMatchObject({ paired: true, pairingCode: null });
  await mockCameraRequest(`/${camera.id}/offer`, camera.viewerToken, 'POST', { sdp: 'v=0\no=viewer' });
  const offered = await signal();
  await mockCameraRequest(`/${camera.id}/answer`, sender.senderToken, 'POST', { revision: offered.revision, sdp: 'v=0\no=sender' });
  expect(await signal()).toMatchObject({ peerOnline: true, answer: { type: 'answer', sdp: 'v=0\no=sender' } });
  await expect(mockCameraRequest(`/${camera.id}`, 'wrong-owner', 'DELETE', undefined)).rejects.toThrow();
  await mockCameraRequest(`/${camera.id}`, camera.viewerToken, 'DELETE', undefined);
  await expect(signal()).rejects.toThrow();
});

it('손상된 저장값과 잘못된 요청을 도메인 처리 전에 거부한다', async () => {
  localStorage.setItem('collection-mock-cameras-v1', '[{"id": 1}]');
  await expect(create()).rejects.toThrow('저장된 카메라 연결 정보');
  localStorage.clear();
  await expect(mockCameraRequest('', 'mock-owner-session', 'POST', { label: 42 })).rejects.toThrow('요청 형식');
});
