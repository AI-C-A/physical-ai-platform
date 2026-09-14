import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cameraRequest, startCameraPeer, type CameraBinding } from '@/entities/collection-camera';
import type * as CameraEntity from '@/entities/collection-camera';
import { BrowserCameraPanel } from './BrowserCameraPanel';
import { CollectionEmptyState } from './CollectionEmptyState';

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
it('연결을 누르면 기존 코드 대신 5분짜리 코드를 발급하고 만료 시 자동 갱신하지 않는다', async () => {
  await show();
  expect(screen.queryByLabelText('Head 연결 코드')).not.toBeInTheDocument();
  vi.mocked(cameraRequest).mockResolvedValueOnce({ ...camera, pairingCode: '654321', pairingExpiresAtMs: Date.now() + 300_000 });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '헤드캠 연결' })); await Promise.resolve(); });
  expect(cameraRequest).toHaveBeenLastCalledWith('/camera/refresh-code', 'viewer', 'POST', { restart: true });
  expect(screen.getByLabelText('Head 연결 코드')).toHaveTextContent('654321');
  expect(screen.getByRole('timer')).toHaveTextContent('5:00');
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(screen.queryByLabelText('Head 연결 코드')).not.toBeInTheDocument();
  expect(screen.getByText('연결 코드가 만료되었습니다.')).toBeVisible();
  expect(cameraRequest).toHaveBeenCalledTimes(2);
});
it('does not renew expired codes for paired cameras', async () => {
  await show({ ...camera, paired: true, pairingCode: null });
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(cameraRequest).toHaveBeenCalledTimes(1);
});
it('만료 뒤 요청 실패 시 재시도할 수 있으며 타이머가 임의로 초기화되지 않는다', async () => {
  await show();
  vi.mocked(cameraRequest).mockResolvedValueOnce(camera);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '헤드캠 연결' })); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  vi.mocked(cameraRequest).mockRejectedValueOnce(new Error('네트워크 오류'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '새 코드 받기' })); await Promise.resolve(); });
  expect(screen.getByRole('alert')).toHaveTextContent('네트워크 오류');
  expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  vi.mocked(cameraRequest).mockResolvedValueOnce({ ...camera, pairingCode: '654321', pairingExpiresAtMs: Date.now() + 300_000 });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '새 코드 받기' })); await Promise.resolve(); });
  expect(screen.getByRole('timer')).toHaveTextContent('5:00');
});

it('adds role-specific analysis cards without opening duplicate camera peers', async () => {
  vi.mocked(cameraRequest).mockResolvedValueOnce([{ ...camera, paired: true }, { ...camera, paired: true, id: 'body', role: 'full-body', label: 'Body' }]);
  await act(async () => { render(<BrowserCameraPanel sessionId="collection" preview={<div>Quest</div>} />); await Promise.resolve(); });
  expect(screen.getByLabelText('Head 카메라')).toBeInTheDocument();
  expect(screen.getByLabelText('Body 카메라')).toBeInTheDocument();
  expect(screen.queryByLabelText('Head · 세그멘테이션 + 핸드')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Body · 4D Humans')).not.toBeInTheDocument();
  expect(startCameraPeer).toHaveBeenCalledTimes(2);
});


it('빈 수집 화면은 연결 안내를 표시하고 손 데이터 수신 시 안내를 없앤다', async () => {
  vi.mocked(cameraRequest).mockResolvedValueOnce([]);
  const connect = vi.fn();
  const emptyState = <CollectionEmptyState onConnect={connect} />;
  const view = await act(async () => { const rendered = render(<BrowserCameraPanel sessionId="collection" preview={null} emptyState={emptyState} />); await Promise.resolve(); return rendered; });
  expect(screen.getByRole('heading', { name: '장치를 연결해 수집을 준비하세요' })).toBeVisible();
  expect(screen.queryByLabelText('손 추적 미리보기')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '장치 연결' }));
  expect(connect).toHaveBeenCalledOnce();
  view.rerender(<BrowserCameraPanel sessionId="collection" preview={<div>손 데이터</div>} emptyState={emptyState} />);
  expect(screen.queryByRole('region', { name: '수집 장치 연결 안내' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('손 추적 미리보기')).toBeVisible();
});

it('설정 창을 열지 않아도 조회 오류와 재시도를 표시하며 복구 후 빈 상태를 보여준다', async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error('카메라 목록 조회 실패'));
  vi.mocked(cameraRequest).mockResolvedValueOnce([]);
  await act(async () => { render(<BrowserCameraPanel sessionId="collection" preview={null} emptyState={<CollectionEmptyState onConnect={vi.fn()} />} />); await Promise.resolve(); });
  expect(screen.getByRole('alert')).toHaveTextContent('카메라 목록 조회 실패');
  expect(screen.queryByRole('region', { name: '수집 장치 연결 안내' })).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '연결 정보 새로고침' })); await Promise.resolve(); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: '수집 장치 연결 안내' })).toBeVisible();
});

it('연결하지 않은 카메라는 코드 발급만으로 미리보기나 분석 조작을 표시하지 않는다', async () => {
  vi.mocked(cameraRequest).mockResolvedValueOnce([camera]);
  await act(async () => { render(<BrowserCameraPanel sessionId="collection" preview={null} />); await Promise.resolve(); });
  expect(screen.getByLabelText('Head 카메라')).not.toBeVisible();
  expect(screen.queryByLabelText('Head · 세그멘테이션 + 핸드')).not.toBeInTheDocument();
  expect(startCameraPeer).toHaveBeenCalledOnce();
});


it('연결 패널이 열리면 중앙 연결 버튼을 숨기고 닫히면 복원한다', () => {
  const connect = vi.fn();
  const view = render(<CollectionEmptyState onConnect={connect} />);
  expect(screen.getByRole('button', { name: '장치 연결' })).toBeVisible();
  view.rerender(<CollectionEmptyState onConnect={connect} showConnect={false} />);
  expect(screen.queryByRole('button', { name: '장치 연결' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '장치를 연결해 수집을 준비하세요' })).toBeVisible();
  view.rerender(<CollectionEmptyState onConnect={connect} />);
  expect(screen.getByRole('button', { name: '장치 연결' })).toBeVisible();
});

it('용도 버튼 한 번으로 이름 입력 없이 코드를 발급하고 중복 추가를 막는다', async () => {
  vi.mocked(cameraRequest).mockResolvedValueOnce([]);
  await act(async () => { render(<BrowserCameraPanel sessionId="collection" />); await Promise.resolve(); });
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  let complete: (value: CameraBinding) => void = () => undefined;
  vi.mocked(cameraRequest).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '전신 카메라 연결' }));
    fireEvent.click(screen.getByRole('button', { name: '전신 카메라 연결' }));
    await Promise.resolve();
  });
  expect(cameraRequest).toHaveBeenCalledTimes(2);
  expect(cameraRequest).toHaveBeenLastCalledWith('', 'owner', 'POST', { collectionId: 'collection', role: 'full-body', label: '전신 카메라 1' });
  expect(screen.getByRole('button', { name: '헤드캠 연결' })).toBeDisabled();
  await act(async () => { complete({ ...camera, role: 'full-body', label: '전신 카메라 1' }); await Promise.resolve(); });
  expect(screen.getByLabelText('전신 카메라 1 연결 코드')).toHaveTextContent('123456');
  expect(screen.queryByText('연결 관리')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '새 코드 받기' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /삭제/u })).not.toBeInTheDocument();
});

it('연결 완료 뒤에는 코드와 관리 버튼 대신 상태와 삭제만 보여준다', async () => {
  await show({ ...camera, paired: true, pairingCode: null });
  expect(screen.queryByLabelText('Head 연결 코드')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '새 코드 받기' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '미리보기 정지' })).not.toBeInTheDocument();
  vi.mocked(cameraRequest).mockResolvedValueOnce(undefined);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Head 삭제' })); await Promise.resolve(); });
  expect(cameraRequest).toHaveBeenLastCalledWith('/camera', 'viewer', 'DELETE');
  expect(screen.queryByRole('region', { name: 'Head 설정' })).not.toBeInTheDocument();
});

it('페어링되면 코드를 없애고 연결 창에서 사이드바로 옮기며 peer는 유지한다', async () => {
  vi.mocked(cameraRequest).mockResolvedValueOnce([camera]);
  const sidebar = document.createElement('div');
  const onConnected = vi.fn();
  const view = await act(async () => {
    const result = render(<BrowserCameraPanel sessionId="collection" connectedTarget={sidebar} onConnected={onConnected} />);
    await Promise.resolve();
    return result;
  });
  view.container.append(sidebar);
  vi.mocked(cameraRequest).mockResolvedValueOnce(camera);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '헤드캠 연결' })); await Promise.resolve(); });
  expect(screen.getByLabelText('Head 연결 코드')).toBeVisible();
  expect(sidebar).toBeEmptyDOMElement();
  act(() => { vi.mocked(startCameraPeer).mock.calls[0]?.[0].onPaired?.(true); });
  expect(screen.queryByLabelText('Head 연결 코드')).not.toBeInTheDocument();
  expect(within(sidebar).getByRole('region', { name: 'Head 설정' })).toBeVisible();
  expect(within(sidebar).getByText('영상 수신 대기')).toBeVisible();
  expect(within(sidebar).getByRole('button', { name: 'Head 삭제' })).toBeVisible();
  expect(onConnected).toHaveBeenCalledOnce();
  expect(startCameraPeer).toHaveBeenCalledOnce();
  view.unmount();
});
