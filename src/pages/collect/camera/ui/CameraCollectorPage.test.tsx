import { BrandingContext } from '@/shared/config';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cameraRequest, startCameraPeer } from '@/entities/collection-camera';
import { CameraCollectorPage } from './CameraCollectorPage';
import type * as CameraEntity from '@/entities/collection-camera';

vi.mock('@/entities/collection-camera', async (original) => ({
  ...await original<typeof CameraEntity>(), cameraRequest: vi.fn(), startCameraPeer: vi.fn(),
}));
const getUserMedia = vi.fn<MediaDevices['getUserMedia']>();
beforeEach(() => {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('RTCPeerConnection', function () {});
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia, enumerateDevices: vi.fn(() => Promise.resolve([])), addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } });
  vi.mocked(cameraRequest).mockResolvedValue({ id: 'camera', label: 'Head 정면', role: 'head', senderToken: 'sender' });
  vi.mocked(startCameraPeer).mockReturnValue({ close: vi.fn(), setRotation: vi.fn() });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); getUserMedia.mockReset(); vi.mocked(cameraRequest).mockReset(); vi.mocked(startCameraPeer).mockReset(); });
async function paired() {
  const user = userEvent.setup();
  const view = render(<BrandingContext.Provider value={{ productName: 'ROBOT Army TIGER+', shortName: 'ROBOT Army TIGER+', logo: '/assets/army-tiger-logo.png' }}><MemoryRouter initialEntries={['/collect/camera?code=123456']}><CameraCollectorPage /></MemoryRouter></BrandingContext.Provider>);
  await user.click(screen.getByRole('button', { name: '연결' }));
  await screen.findByRole('heading', { name: 'Head 정면' });
  return { user, view };
}

it('pairs without opening a camera, then explains denied permission without starting a peer', async () => {
  const { user } = await paired();
  expect(getUserMedia).not.toHaveBeenCalled();
  getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
  await user.click(screen.getByRole('button', { name: '영상 전송 시작' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('카메라 권한이 거부');
  expect(startCameraPeer).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '영상 전송 시작' })).toBeEnabled();
});

it('stops a late permission result when the user cancels while getUserMedia is pending', async () => {
  let resolveStream: (stream: MediaStream) => void = () => undefined;
  getUserMedia.mockImplementation(() => new Promise((resolve) => { resolveStream = resolve; }));
  const { user } = await paired();
  await user.click(screen.getByRole('button', { name: '영상 전송 시작' }));
  await user.click(screen.getByRole('button', { name: '영상 전송 중지' }));
  const stop = vi.fn();
  await act(async () => { resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream); await Promise.resolve(); });
  expect(stop).toHaveBeenCalledOnce();
  expect(startCameraPeer).not.toHaveBeenCalled();
});

it('stops capture and signaling when a sender page unmounts', async () => {
  const track = { stop: vi.fn(), onended: null, getSettings: () => ({ deviceId: 'usb-head' }) };
  getUserMedia.mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream);
  const close = vi.fn();
  vi.mocked(startCameraPeer).mockReturnValue({ close, setRotation: vi.fn() });
  const { user, view } = await paired();
  await user.click(screen.getByRole('button', { name: '영상 전송 시작' }));
  await waitFor(() => expect(startCameraPeer).toHaveBeenCalledOnce());
  expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
  view.unmount();
  expect(close).toHaveBeenCalledOnce();
  expect(track.stop).toHaveBeenCalledOnce();
});

it('rejects reuse of one physical camera in another slot without stopping the first', async () => {
  const firstTrack = { stop: vi.fn(), onended: null, getSettings: () => ({ deviceId: 'same-usb-camera' }) };
  const secondTrack = { ...firstTrack, stop: vi.fn() };
  const stream = (track: typeof firstTrack) => ({ getTracks: () => [track], getVideoTracks: () => [track] }) as unknown as MediaStream;
  getUserMedia.mockResolvedValueOnce(stream(firstTrack)).mockResolvedValueOnce(stream(secondTrack));
  const { user } = await paired();
  await user.click(screen.getByRole('button', { name: '영상 전송 시작' }));
  await waitFor(() => expect(startCameraPeer).toHaveBeenCalledOnce());
  await user.click(screen.getByRole('button', { name: '카메라 추가 연결' }));
  const second = within(screen.getByRole('region', { name: '카메라 연결 2' }));
  await user.type(second.getByLabelText('6자리 연결 코드'), '234567');
  await user.click(second.getByRole('button', { name: '연결' }));
  await user.click(await second.findByRole('button', { name: '영상 전송 시작' }));
  expect(await second.findByRole('alert')).toHaveTextContent('다른 연결에서 사용 중');
  expect(secondTrack.stop).toHaveBeenCalledOnce();
  expect(firstTrack.stop).not.toHaveBeenCalled();
  expect(startCameraPeer).toHaveBeenCalledOnce();
});
