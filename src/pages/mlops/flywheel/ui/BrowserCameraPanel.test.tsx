import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cameraRequest, startCameraPeer, type CameraBinding } from '@/entities/collection-camera';
import type * as CameraEntity from '@/entities/collection-camera';
import { BrowserCameraPanel } from './BrowserCameraPanel';

vi.mock('@/entities/collection-camera', async (original) => ({
  ...await original<typeof CameraEntity>(), cameraRequest: vi.fn(), startCameraPeer: vi.fn(),
}));
const camera: CameraBinding = { id: 'camera', collectionId: 'collection', label: 'Head', role: 'head', viewerToken: 'viewer', pairingCode: '123456', pairingExpiresAtMs: 2_000, paired: false };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ viewerToken: 'owner' }) }));
  vi.mocked(startCameraPeer).mockReturnValue({ close: vi.fn(), setRotation: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
async function show(binding = camera) {
  vi.mocked(cameraRequest).mockResolvedValueOnce([binding]);
  await act(async () => { render(<BrowserCameraPanel sessionId="collection" />); await Promise.resolve(); });
}
it('automatically replaces expired codes, updates links and keeps only one renewal in flight', async () => {
  await show();
  let complete: (value: CameraBinding) => void = () => undefined;
  vi.mocked(cameraRequest).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(screen.queryByLabelText('Head 연결 코드')).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
  expect(cameraRequest).toHaveBeenCalledTimes(2);
  expect(cameraRequest).toHaveBeenLastCalledWith('/camera/refresh-code', 'viewer', 'POST', {}, expect.any(AbortSignal));
  await act(async () => { complete({ ...camera, pairingCode: '654321', pairingExpiresAtMs: 100_000 }); await Promise.resolve(); });
  expect(screen.getByLabelText('Head 연결 코드')).toHaveTextContent('654321');
  expect(screen.getByRole('link', { name: '카메라에서 열기' })).toHaveAttribute('href', expect.stringContaining('code=654321'));
});
it('does not renew expired codes for paired cameras', async () => {
  await show({ ...camera, paired: true, pairingCode: null });
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(cameraRequest).toHaveBeenCalledTimes(1);
});
it('retries renewal after a network failure without displaying the expired code', async () => {
  await show();
  vi.mocked(cameraRequest).mockRejectedValueOnce(new Error('네트워크 오류'));
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(screen.queryByLabelText('Head 연결 코드')).not.toBeInTheDocument();
  vi.mocked(cameraRequest).mockResolvedValueOnce({ ...camera, pairingCode: '654321', pairingExpiresAtMs: 100_000 });
  await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
  expect(cameraRequest).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(screen.getByLabelText('Head 연결 코드')).toHaveTextContent('654321');
});

it('adds role-specific analysis cards without opening duplicate camera peers', async () => {
  vi.mocked(cameraRequest).mockResolvedValueOnce([camera, { ...camera, id: 'body', role: 'full-body', label: 'Body' }]);
  await act(async () => { render(<BrowserCameraPanel sessionId="collection" preview={<div>Quest</div>} />); await Promise.resolve(); });
  expect(screen.getByLabelText('Head 카메라')).toBeInTheDocument();
  expect(screen.getByLabelText('Body 카메라')).toBeInTheDocument();
  expect(screen.getByLabelText('Head · 세그멘테이션 + 핸드')).toBeInTheDocument();
  expect(screen.getByLabelText('Body · 4D Humans')).toBeInTheDocument();
  expect(startCameraPeer).toHaveBeenCalledTimes(2);
});
