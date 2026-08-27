const segmentationEndpoint = '/api/segmentation/infer';
const segmentationBatchEndpoint = '/api/segmentation/infer-batch';
const segmentationBatchContentType = 'application/vnd.army-tiger.segmentation-batch';
const batchMagic = new Uint8Array([0x53, 0x47, 0x42, 0x31]);
const batchResponseMagic = new Uint8Array([0x53, 0x47, 0x52, 0x32]);
const batchHeaderBytes = batchMagic.byteLength + 2;
const batchItemHeaderBytes = 4;

type SegmentationFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface SegmentationLabel {
  readonly className: string;
  readonly color: string;
  readonly confidence: number | null;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface SegmentationOverlayResult {
  readonly labels: readonly SegmentationLabel[];
  readonly overlay: Blob;
}

function readBatchCount(view: DataView, magic: Uint8Array): number {
  if (view.byteLength < batchHeaderBytes) {
    throw new Error('세그멘테이션 배치 응답이 너무 짧습니다.');
  }
  for (let index = 0; index < magic.byteLength; index += 1) {
    if (view.getUint8(index) !== magic[index]) {
      throw new Error('세그멘테이션 배치 응답 헤더가 올바르지 않습니다.');
    }
  }
  const itemCount = view.getUint16(batchMagic.byteLength);
  if (itemCount === 0 || itemCount > 6) {
    throw new Error('세그멘테이션 배치 응답 개수가 올바르지 않습니다.');
  }
  return itemCount;
}

function unsignedInteger(value: number, byteLength: 2 | 4): ArrayBuffer {
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  if (byteLength === 2) view.setUint16(0, value);
  else view.setUint32(0, value);
  return buffer;
}

function encodeBatch(frames: readonly Blob[]): Blob {
  if (frames.length === 0 || frames.length > 6) {
    throw new Error('세그멘테이션 배치는 1개 이상 6개 이하여야 합니다.');
  }

  const parts: BlobPart[] = [
    batchMagic.buffer,
    unsignedInteger(frames.length, 2),
  ];
  frames.forEach((frame) => {
    parts.push(unsignedInteger(frame.size, 4), frame);
  });
  return new Blob(parts, { type: segmentationBatchContentType });
}

function isSegmentationLabel(value: unknown): value is SegmentationLabel {
  if (typeof value !== 'object' || value === null) return false;
  const label = value as Record<string, unknown>;
  return typeof label.className === 'string'
    && /^#[\da-f]{6}$/iu.test(typeof label.color === 'string' ? label.color : '')
    && (typeof label.confidence === 'number' || label.confidence === null)
    && typeof label.left === 'number'
    && label.left >= 0
    && label.left <= 1
    && typeof label.right === 'number'
    && label.right >= label.left
    && label.right <= 1
    && typeof label.top === 'number'
    && label.top >= 0
    && label.top <= 1;
}

function decodeLabels(payload: ArrayBuffer): readonly SegmentationLabel[] {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(payload));
  if (!Array.isArray(parsed) || !parsed.every(isSegmentationLabel)) {
    throw new Error('세그멘테이션 라벨 응답이 올바르지 않습니다.');
  }
  return parsed;
}

function decodeBatch(payload: ArrayBuffer): SegmentationOverlayResult[] {
  const view = new DataView(payload);
  const itemCount = readBatchCount(view, batchResponseMagic);
  const results: SegmentationOverlayResult[] = [];
  let offset = batchHeaderBytes;

  for (let index = 0; index < itemCount; index += 1) {
    if (offset + batchItemHeaderBytes > view.byteLength) {
      throw new Error('세그멘테이션 배치 응답 길이가 누락되었습니다.');
    }
    const itemLength = view.getUint32(offset);
    offset += batchItemHeaderBytes;
    const itemEnd = offset + itemLength;
    if (itemLength === 0 || itemEnd > view.byteLength) {
      throw new Error('세그멘테이션 배치 응답 데이터가 올바르지 않습니다.');
    }
    const overlay = new Blob([payload.slice(offset, itemEnd)], { type: 'image/png' });
    offset = itemEnd;
    if (offset + batchItemHeaderBytes > view.byteLength) {
      throw new Error('세그멘테이션 라벨 응답 길이가 누락되었습니다.');
    }
    const labelLength = view.getUint32(offset);
    offset += batchItemHeaderBytes;
    const labelEnd = offset + labelLength;
    if (labelEnd > view.byteLength) {
      throw new Error('세그멘테이션 라벨 응답 데이터가 올바르지 않습니다.');
    }
    const labels = decodeLabels(payload.slice(offset, labelEnd));
    results.push({ labels, overlay });
    offset = labelEnd;
  }

  if (offset !== view.byteLength) {
    throw new Error('세그멘테이션 배치 응답 끝에 알 수 없는 데이터가 있습니다.');
  }
  return results;
}

export async function requestSegmentationOverlay(
  frame: Blob,
  signal: AbortSignal,
  fetcher: SegmentationFetcher = globalThis.fetch,
): Promise<Blob> {
  const response = await fetcher(segmentationEndpoint, {
    body: frame,
    cache: 'no-store',
    headers: { 'Content-Type': 'image/jpeg' },
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    throw new Error(`세그멘테이션 요청에 실패했습니다. (HTTP ${String(response.status)})`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLocaleLowerCase().startsWith('image/png')) {
    throw new Error('세그멘테이션 응답 형식이 올바르지 않습니다.');
  }

  return response.blob();
}

export async function requestSegmentationOverlayBatch(
  frames: readonly Blob[],
  signal: AbortSignal,
  fetcher: SegmentationFetcher = globalThis.fetch,
): Promise<SegmentationOverlayResult[]> {
  const body = encodeBatch(frames);
  if (signal.aborted) throw new DOMException('요청이 중단되었습니다.', 'AbortError');

  const response = await fetcher(segmentationBatchEndpoint, {
    body,
    cache: 'no-store',
    headers: { 'Content-Type': segmentationBatchContentType },
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    throw new Error(`세그멘테이션 배치 요청에 실패했습니다. (HTTP ${String(response.status)})`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLocaleLowerCase().startsWith(segmentationBatchContentType)) {
    throw new Error('세그멘테이션 배치 응답 형식이 올바르지 않습니다.');
  }

  const results = decodeBatch(await response.arrayBuffer());
  if (results.length !== frames.length) {
    throw new Error('세그멘테이션 배치 응답 개수가 요청과 다릅니다.');
  }
  return results;
}
