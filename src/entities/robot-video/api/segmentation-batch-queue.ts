import {
  requestSegmentationOverlayBatch,
  type SegmentationOverlayResult,
} from './segmentation-client';

const maximumBatchSize = 6;
const batchCollectionDelayMs = 4;

interface PendingRequest {
  aborted: boolean;
  readonly frame: Blob;
  readonly onAbort: () => void;
  readonly reject: (reason: unknown) => void;
  readonly resolve: (result: SegmentationOverlayResult) => void;
  readonly signal: AbortSignal;
}

interface ActiveBatch {
  readonly controller: AbortController;
  readonly requests: readonly PendingRequest[];
}

let collectionTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRequests: PendingRequest[] = [];
let activeBatch: ActiveBatch | null = null;

function abortError(): DOMException {
  return new DOMException('세그멘테이션 요청이 중단되었습니다.', 'AbortError');
}

function scheduleBatch(): void {
  if (
    activeBatch !== null
    || collectionTimer !== null
    || pendingRequests.length === 0
  ) return;
  collectionTimer = setTimeout(() => {
    collectionTimer = null;
    startNextBatch();
  }, batchCollectionDelayMs);
}

function takeNextBatch(): PendingRequest[] {
  const batch: PendingRequest[] = [];
  while (batch.length < maximumBatchSize && pendingRequests.length > 0) {
    const request = pendingRequests.shift();
    if (request !== undefined && !request.aborted) batch.push(request);
  }
  return batch;
}

function finishActiveBatch(batch: ActiveBatch): void {
  batch.requests.forEach((request) => {
    request.signal.removeEventListener('abort', request.onAbort);
  });
  if (activeBatch === batch) activeBatch = null;

  if (pendingRequests.filter((request) => !request.aborted).length >= maximumBatchSize) {
    startNextBatch();
    return;
  }
  scheduleBatch();
}

async function executeBatch(batch: ActiveBatch): Promise<void> {
  const { controller, requests } = batch;

  try {
    const results = await requestSegmentationOverlayBatch(
      requests.map((request) => request.frame),
      controller.signal,
    );
    requests.forEach((request, index) => {
      const result = results[index];
      if (request.aborted) return;
      if (result === undefined) {
        request.reject(new Error('세그멘테이션 배치 응답이 누락되었습니다.'));
        return;
      }
      request.resolve(result);
    });
  } catch (error: unknown) {
    requests.forEach((request) => {
      if (!request.aborted) request.reject(error);
    });
  } finally {
    finishActiveBatch(batch);
  }
}

function startNextBatch(): void {
  if (activeBatch !== null) return;
  if (collectionTimer !== null) {
    clearTimeout(collectionTimer);
    collectionTimer = null;
  }

  const requests = takeNextBatch();
  if (requests.length === 0) return;

  const batch: ActiveBatch = {
    controller: new AbortController(),
    requests,
  };
  activeBatch = batch;
  void executeBatch(batch);
}

function abortRequest(request: PendingRequest): void {
  request.aborted = true;
  request.reject(abortError());

  if (activeBatch?.requests.includes(request) === true) {
    if (activeBatch.requests.every((activeRequest) => activeRequest.aborted)) {
      activeBatch.controller.abort();
    }
    return;
  }

  pendingRequests = pendingRequests.filter((pendingRequest) => pendingRequest !== request);
  if (pendingRequests.length === 0 && collectionTimer !== null) {
    clearTimeout(collectionTimer);
    collectionTimer = null;
  }
}

export function requestQueuedSegmentationOverlay(
  frame: Blob,
  signal: AbortSignal,
): Promise<SegmentationOverlayResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const request: PendingRequest = {
      aborted: false,
      frame,
      onAbort: () => abortRequest(request),
      reject,
      resolve,
      signal,
    };
    signal.addEventListener('abort', request.onAbort, { once: true });
    pendingRequests.push(request);

    if (pendingRequests.length >= maximumBatchSize) {
      startNextBatch();
      return;
    }
    scheduleBatch();
  });
}
