import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CollectionCameraPanel } from './CollectionCameraPanel';
import { connectCollectionCamera } from './collection-camera-connection';
import type * as CameraConnection from './collection-camera-connection';

vi.mock('./collection-camera-connection', async (original) => ({
  ...await original<typeof CameraConnection>(),
  connectCollectionCamera: vi.fn(),
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(connectCollectionCamera).mockReset(); });

it('keeps camera connections independent, reports live only on playback and closes both on unmount', async () => {
  vi.stubGlobal('RTCPeerConnection', function () {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const headClose = vi.fn();
  const bodyClose = vi.fn();
  vi.mocked(connectCollectionCamera).mockReturnValueOnce({ close: headClose }).mockReturnValueOnce({ close: bodyClose });
  const user = userEvent.setup();
  const view = render(<CollectionCameraPanel />);
  const head = within(screen.getByRole('region', { name: '헤드캠 연결' }));
  const body = within(screen.getByRole('region', { name: '전신 카메라 연결' }));
  await user.type(head.getByLabelText('헤드캠 WebRTC 주소'), 'https://pi/head/whep');
  await user.click(head.getByRole('button', { name: '카메라 연결' }));
  expect(head.getByText('연결 중')).toBeInTheDocument();
  expect(head.queryByText('영상 수신 중')).not.toBeInTheDocument();
  await user.type(body.getByLabelText('전신 카메라 WebRTC 주소'), 'https://pi/body/whep');
  await user.click(body.getByRole('button', { name: '카메라 연결' }));
  fireEvent.playing(head.getByLabelText('헤드캠 실시간 영상'));
  expect(head.getByText('영상 수신 중')).toBeInTheDocument();
  expect(body.getByText('연결 중')).toBeInTheDocument();
  await user.click(head.getByRole('button', { name: '연결 해제' }));
  expect(headClose).toHaveBeenCalledOnce();
  expect(bodyClose).not.toHaveBeenCalled();
  view.unmount();
  expect(bodyClose).toHaveBeenCalledOnce();
});

it('clears failed video, allows retry and ignores stale callbacks', async () => {
  vi.stubGlobal('RTCPeerConnection', function () {});
  const close = vi.fn();
  vi.mocked(connectCollectionCamera).mockReturnValue({ close });
  const user = userEvent.setup();
  render(<CollectionCameraPanel />);
  const head = within(screen.getByRole('region', { name: '헤드캠 연결' }));
  await user.type(head.getByLabelText('헤드캠 WebRTC 주소'), 'https://pi/head/whep');
  await user.click(head.getByRole('button', { name: '카메라 연결' }));
  const first = vi.mocked(connectCollectionCamera).mock.calls[0]![1];
  act(() => first.onError('카메라 연결이 끊겼습니다.'));
  expect(head.getByRole('alert')).toHaveTextContent('끊겼습니다');
  expect(head.getByLabelText('헤드캠 실시간 영상')).toHaveProperty('srcObject', null);
  await user.click(head.getByRole('button', { name: '다시 연결' }));
  act(() => first.onError('오래된 오류'));
  expect(head.queryByRole('alert')).not.toBeInTheDocument();
  expect(connectCollectionCamera).toHaveBeenCalledTimes(2);
});
