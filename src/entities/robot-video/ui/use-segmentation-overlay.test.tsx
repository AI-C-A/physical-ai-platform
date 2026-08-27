import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestQueuedSegmentationOverlay } from '../api/segmentation-batch-queue';
import { useSegmentationOverlay } from './use-segmentation-overlay';

vi.mock('../api/segmentation-batch-queue', () => ({
  requestQueuedSegmentationOverlay: vi.fn(),
}));

function SegmentationHarness({ enabled = true }: { readonly enabled?: boolean }) {
  const overlayRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const state = useSegmentationOverlay({ enabled, overlayRef, videoRef });

  return (
    <>
      <video data-testid="video" ref={videoRef} />
      <img alt="" data-testid="overlay" ref={overlayRef} />
      <output data-testid="labels">
        {state.labels.map((label) => label.className).join(',')}
      </output>
      <output data-testid="metrics">
        {state.metrics === null ? '' : String(state.metrics.latencyMs)}
      </output>
    </>
  );
}

function makeVideoReady(): void {
  const video = screen.getByTestId('video');
  Object.defineProperties(video, {
    readyState: {
      configurable: true,
      value: HTMLMediaElement.HAVE_CURRENT_DATA,
    },
    videoHeight: { configurable: true, value: 720 },
    videoWidth: { configurable: true, value: 1280 },
  });
}

describe('useSegmentationOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(requestQueuedSegmentationOverlay).mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob(['frame'], { type: 'image/jpeg' })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('최신 결과의 overlay와 label을 적용하고 unmount에서 URL과 timer를 정리한다', async () => {
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:segmentation-overlay');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
    vi.mocked(requestQueuedSegmentationOverlay).mockResolvedValue({
      labels: [{
        className: 'person',
        color: '#99d334',
        confidence: 0.9,
        left: 0.1,
        right: 0.2,
        top: 0.3,
      }],
      overlay: new Blob(['overlay'], { type: 'image/png' }),
    });

    const view = render(<SegmentationHarness />);
    makeVideoReady();
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(requestQueuedSegmentationOverlay).toHaveBeenCalledOnce();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(screen.getByTestId('overlay')).toHaveAttribute(
      'src',
      'blob:segmentation-overlay',
    );
    expect(screen.getByTestId('labels')).toHaveTextContent('person');
    expect(screen.getByTestId('metrics')).not.toHaveTextContent('');

    view.unmount();

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:segmentation-overlay');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('실패한 요청을 정해진 backoff 뒤에 다시 시도한다', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:retry-overlay');
    vi.spyOn(URL, 'revokeObjectURL');
    vi.mocked(requestQueuedSegmentationOverlay)
      .mockRejectedValueOnce(new Error('일시적인 추론 실패'))
      .mockResolvedValueOnce({ labels: [], overlay: new Blob(['overlay']) });

    const view = render(<SegmentationHarness />);
    makeVideoReady();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(requestQueuedSegmentationOverlay).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTimeAsync(399));
    expect(requestQueuedSegmentationOverlay).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(requestQueuedSegmentationOverlay).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('요청이 끝나기 전에 unmount되면 signal을 중단하고 늦은 결과를 버린다', async () => {
    let requestSignal: AbortSignal | null = null;
    const readRequestSignal = (): AbortSignal => {
      if (requestSignal === null) {
        throw new Error('세그멘테이션 요청 signal이 설정되지 않았습니다.');
      }
      return requestSignal;
    };
    vi.mocked(requestQueuedSegmentationOverlay).mockImplementation(
      (_frame, signal) => {
        requestSignal = signal;
        return new Promise(() => undefined);
      },
    );

    const view = render(<SegmentationHarness />);
    makeVideoReady();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const activeSignal = readRequestSignal();
    expect(activeSignal.aborted).toBe(false);

    view.unmount();

    expect(activeSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
