import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestSegmentationOverlayBatch } from './segmentation-client';
import { requestQueuedSegmentationOverlay } from './segmentation-batch-queue';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let rejectPromise: Deferred<T>['reject'] = () => undefined;
  let resolvePromise: Deferred<T>['resolve'] = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

function overlayResult(name: string) {
  return {
    labels: [],
    overlay: new Blob([name]),
  };
}

function requireSignal(signal: AbortSignal | null): AbortSignal {
  if (signal === null) {
    throw new Error('세그멘테이션 네트워크 signal이 설정되지 않았습니다.');
  }
  return signal;
}

vi.mock('./segmentation-client', () => ({
  requestSegmentationOverlayBatch: vi.fn((frames: readonly Blob[]) => Promise.resolve(
    frames.map((_frame, index) => ({
      labels: [],
      overlay: new Blob([`overlay-${String(index)}`]),
    })),
  )),
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.mocked(requestSegmentationOverlayBatch).mockClear();
});

describe('segmentation batch queue', () => {
  it('같은 시점의 카메라 프레임을 한 요청으로 묶는다', async () => {
    vi.useFakeTimers();
    const requests = [
      requestQueuedSegmentationOverlay(
        new Blob(['frame-a']),
        new AbortController().signal,
      ),
      requestQueuedSegmentationOverlay(
        new Blob(['frame-b']),
        new AbortController().signal,
      ),
      requestQueuedSegmentationOverlay(
        new Blob(['frame-c']),
        new AbortController().signal,
      ),
    ];

    await vi.advanceTimersByTimeAsync(4);
    const results = await Promise.all(requests);

    expect(requestSegmentationOverlayBatch).toHaveBeenCalledOnce();
    expect(vi.mocked(requestSegmentationOverlayBatch).mock.calls[0]?.[0]).toHaveLength(3);
    await expect(Promise.all(results.map((result) => result.overlay.text())))
      .resolves.toEqual(['overlay-0', 'overlay-1', 'overlay-2']);
  });

  it('수집 중인 요청이 취소되면 네트워크 요청을 시작하지 않는다', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const request = requestQueuedSegmentationOverlay(
      new Blob(['frame']),
      controller.signal,
    );

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(4);
    expect(requestSegmentationOverlayBatch).not.toHaveBeenCalled();
  });

  it('실행 중인 batch의 모든 소비자가 취소되면 실제 요청 signal을 중단한다', async () => {
    vi.useFakeTimers();
    const networkRequest = deferred<never>();
    let networkSignal: AbortSignal | null = null;
    vi.mocked(requestSegmentationOverlayBatch).mockImplementation(
      (_frames, signal) => {
        networkSignal = signal;
        signal.addEventListener('abort', () => {
          networkRequest.reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
        return networkRequest.promise;
      },
    );
    const controller = new AbortController();
    const request = requestQueuedSegmentationOverlay(
      new Blob(['frame']),
      controller.signal,
    );

    await vi.advanceTimersByTimeAsync(4);
    const activeNetworkSignal = requireSignal(networkSignal);
    expect(activeNetworkSignal.aborted).toBe(false);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(activeNetworkSignal.aborted).toBe(true);
    await networkRequest.promise.catch(() => undefined);
  });

  it('일부 소비자만 취소되면 batch를 유지하고 나머지 결과 순서를 보존한다', async () => {
    vi.useFakeTimers();
    const networkRequest = deferred<ReturnType<typeof overlayResult>[]>();
    let networkSignal: AbortSignal | null = null;
    vi.mocked(requestSegmentationOverlayBatch).mockImplementation(
      (_frames, signal) => {
        networkSignal = signal;
        return networkRequest.promise;
      },
    );
    const firstController = new AbortController();
    const secondController = new AbortController();
    const firstRequest = requestQueuedSegmentationOverlay(
      new Blob(['frame-a']),
      firstController.signal,
    );
    const secondRequest = requestQueuedSegmentationOverlay(
      new Blob(['frame-b']),
      secondController.signal,
    );

    await vi.advanceTimersByTimeAsync(4);
    const activeNetworkSignal = requireSignal(networkSignal);
    firstController.abort();
    await expect(firstRequest).rejects.toMatchObject({ name: 'AbortError' });
    expect(activeNetworkSignal.aborted).toBe(false);

    networkRequest.resolve([overlayResult('overlay-a'), overlayResult('overlay-b')]);
    await expect(secondRequest.then((result) => result.overlay.text()))
      .resolves.toBe('overlay-b');
    expect(activeNetworkSignal.aborted).toBe(false);
  });

  it('이전 batch가 끝난 뒤에만 다음 batch를 시작한다', async () => {
    vi.useFakeTimers();
    const firstNetworkRequest = deferred<ReturnType<typeof overlayResult>[]>();
    const secondNetworkRequest = deferred<ReturnType<typeof overlayResult>[]>();
    vi.mocked(requestSegmentationOverlayBatch)
      .mockImplementationOnce(() => firstNetworkRequest.promise)
      .mockImplementationOnce(() => secondNetworkRequest.promise);

    const firstBatch = Array.from({ length: 6 }, (_value, index) => (
      requestQueuedSegmentationOverlay(
        new Blob([`frame-${String(index)}`]),
        new AbortController().signal,
      )
    ));
    const secondBatchRequest = requestQueuedSegmentationOverlay(
      new Blob(['frame-6']),
      new AbortController().signal,
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(requestSegmentationOverlayBatch).toHaveBeenCalledOnce();

    firstNetworkRequest.resolve(Array.from(
      { length: 6 },
      (_value, index) => overlayResult(`overlay-${String(index)}`),
    ));
    await Promise.all(firstBatch);
    await vi.advanceTimersByTimeAsync(4);
    expect(requestSegmentationOverlayBatch).toHaveBeenCalledTimes(2);

    secondNetworkRequest.resolve([overlayResult('overlay-6')]);
    await expect(secondBatchRequest.then((result) => result.overlay.text()))
      .resolves.toBe('overlay-6');
  });
});
