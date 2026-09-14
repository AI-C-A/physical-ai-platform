import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCameraAnalysis } from './use-camera-analysis';

let videoRef: { current: HTMLVideoElement };
let imageRef: { current: HTMLImageElement };
const rotate = vi.fn();
const revoke = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  videoRef = { current: document.createElement('video') };
  imageRef = { current: document.createElement('img') };
  Object.defineProperties(videoRef.current, { readyState: { value: 4 }, videoWidth: { value: 640 }, videoHeight: { value: 480 }, paused: { value: false } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ translate: vi.fn(), rotate, drawImage: vi.fn() } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })));
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['png'], { type: 'image/png' }), { headers: { 'content-type': 'image/png', 'x-perception-mode': 'head', 'x-detection-count': '0' } })));
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn().mockReturnValue('blob:analysis'), revokeObjectURL: revoke }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); rotate.mockReset(); });

it('uses rotated frames, accepts zero hands, and releases the result when paused', async () => {
  const { result, rerender } = renderHook(({ enabled }) => useCameraAnalysis({ videoRef, imageRef, role: 'head', rotation: 90, enabled }), { initialProps: { enabled: true } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/perception/head/infer');
  expect(vi.mocked(fetch).mock.calls[0]?.[1]?.body).toBeInstanceOf(Blob);
  expect(rotate).toHaveBeenCalledWith(Math.PI / 2);
  expect(result.current).toMatchObject({ status: 'ready', count: 0 });
  rerender({ enabled: false });
  expect(imageRef.current).not.toHaveAttribute('src');
  expect(revoke).toHaveBeenCalledWith('blob:analysis');
});

it('keeps one in-flight request and aborts on unmount without stopping source tracks', async () => {
  vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
  const { unmount } = renderHook(() => useCameraAnalysis({ videoRef, imageRef, role: 'full-body', rotation: 0, enabled: true }));
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(fetch).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
});

it('clears stale output while the next request is pending', async () => {
  const { result } = renderHook(() => useCameraAnalysis({ videoRef, imageRef, role: 'head', rotation: 0, enabled: true }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
  await act(async () => { await vi.advanceTimersByTimeAsync(3_001); });
  expect(result.current.status).toBe('loading');
  expect(imageRef.current).not.toHaveAttribute('src');
});

it('rejects wrong-role output and retries a failed server', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('png', { headers: { 'content-type': 'image/png', 'x-perception-mode': 'full-body', 'x-detection-count': '1' } }));
  const { result } = renderHook(() => useCameraAnalysis({ videoRef, imageRef, role: 'head', rotation: 0, enabled: true }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(result.current.status).toBe('error');
  expect(imageRef.current).not.toHaveAttribute('src');
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(result.current.status).toBe('ready');
});

it.each([
  [404, '분석 경로를 찾을 수 없습니다'],
  [429, '다른 요청을 처리 중'],
  [500, '서버 또는 프록시'],
  [502, '정상 응답을 받지 못했습니다'],
  [503, '모델·GPU 상태'],
  [504, '시간을 초과'],
])('explains HTTP %s failures', async (status, message) => {
  vi.mocked(fetch).mockResolvedValue(new Response('failure', { status }));
  const { result } = renderHook(() => useCameraAnalysis({ videoRef, imageRef, role: 'head', rotation: 0, enabled: true }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(result.current.error).toContain(`HTTP ${status}`);
  expect(result.current.error).toContain(message);
});

it.each([
  [new DOMException('timeout', 'TimeoutError'), '25초 안에 응답하지 않았습니다'],
  [new TypeError('Failed to fetch'), '네트워크와 분석 서버 연결'],
  [new DOMException('tainted canvas', 'SecurityError'), 'CORS 설정'],
])('explains request failures: %s', async (error, message) => {
  vi.mocked(fetch).mockRejectedValueOnce(error);
  const { result } = renderHook(() => useCameraAnalysis({ videoRef, imageRef, role: 'head', rotation: 0, enabled: true }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(result.current.error).toContain(message);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(result.current).toMatchObject({ status: 'ready', error: null });
});

it('keeps the cause visible while retrying and clears it when stopped', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('failure', { status: 503 }));
  const { result, rerender } = renderHook(({ enabled }) => useCameraAnalysis({ videoRef, imageRef, role: 'head', rotation: 0, enabled }), { initialProps: { enabled: true } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(result.current.status).toBe('error');
  expect(result.current.error).toContain('HTTP 503');
  rerender({ enabled: false });
  expect(result.current).toMatchObject({ status: 'waiting', error: null });
});
