import { describe, expect, it, vi } from 'vitest';

import {
  requestSegmentationOverlay,
  requestSegmentationOverlayBatch,
} from './segmentation-client';

const batchContentType = 'application/vnd.army-tiger.segmentation-batch';

function createBatchResponsePayload(items: readonly {
  readonly labels: readonly unknown[];
  readonly overlay: Uint8Array;
}[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const encodedItems = items.map((item) => ({
    labels: encoder.encode(JSON.stringify(item.labels)),
    overlay: item.overlay,
  }));
  const payloadSize = 6 + encodedItems.reduce(
    (total, item) => total + 8 + item.overlay.byteLength + item.labels.byteLength,
    0,
  );
  const payload = new ArrayBuffer(payloadSize);
  const bytes = new Uint8Array(payload);
  const view = new DataView(payload);
  bytes.set([0x53, 0x47, 0x52, 0x32]);
  view.setUint16(4, encodedItems.length);
  let offset = 6;
  encodedItems.forEach((item) => {
    view.setUint32(offset, item.overlay.byteLength);
    offset += 4;
    bytes.set(item.overlay, offset);
    offset += item.overlay.byteLength;
    view.setUint32(offset, item.labels.byteLength);
    offset += 4;
    bytes.set(item.labels, offset);
    offset += item.labels.byteLength;
  });
  return payload;
}

describe('requestSegmentationOverlay', () => {
  it('JPEG 프레임을 보내고 PNG 오버레이를 반환한다', async () => {
    const overlay = new Blob(['overlay'], { type: 'image/png' });
    const fetcher = vi.fn(() => Promise.resolve(new Response(overlay, {
      headers: { 'Content-Type': 'image/png' },
    })));
    const frame = new Blob(['frame'], { type: 'image/jpeg' });
    const controller = new AbortController();

    await expect(
      requestSegmentationOverlay(frame, controller.signal, fetcher),
    ).resolves.toEqual(overlay);

    expect(fetcher).toHaveBeenCalledWith('/api/segmentation/infer', {
      body: frame,
      cache: 'no-store',
      headers: { 'Content-Type': 'image/jpeg' },
      method: 'POST',
      signal: controller.signal,
    });
  });

  it('PNG가 아닌 성공 응답도 거부한다', async () => {
    const fetcher = () => Promise.resolve(Response.json({ error: 'invalid' }));

    await expect(requestSegmentationOverlay(
      new Blob(['frame']),
      new AbortController().signal,
      fetcher,
    )).rejects.toThrow('세그멘테이션 응답 형식이 올바르지 않습니다.');
  });

  it('여러 JPEG를 하나의 바이너리 배치로 보내고 PNG들을 순서대로 반환한다', async () => {
    const responsePayload = createBatchResponsePayload([
      {
        labels: [{
          className: 'person',
          color: '#99d334',
          confidence: 0.93,
          left: 0.25,
          right: 0.75,
          top: 0.5,
        }],
        overlay: new TextEncoder().encode('overlay-a'),
      },
      { labels: [], overlay: new TextEncoder().encode('overlay-b') },
    ]);
    const fetcher = vi.fn((
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      void input;
      void init;
      return Promise.resolve(new Response(responsePayload, {
        headers: { 'Content-Type': batchContentType },
      }));
    });
    const controller = new AbortController();

    const results = await requestSegmentationOverlayBatch(
      [new Blob(['frame-a']), new Blob(['frame-b'])],
      controller.signal,
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    const [endpoint, init] = fetcher.mock.calls[0] ?? [];
    expect(endpoint).toBe('/api/segmentation/infer-batch');
    expect(init).toMatchObject({
      cache: 'no-store',
      headers: { 'Content-Type': batchContentType },
      method: 'POST',
      signal: controller.signal,
    });
    const requestBody = init?.body;
    expect(requestBody).toBeInstanceOf(Blob);
    const requestView = new DataView(await (requestBody as Blob).arrayBuffer());
    expect(requestView.getUint16(4)).toBe(2);
    expect(await results[0]?.overlay.text()).toBe('overlay-a');
    expect(results[0]?.labels).toEqual([{
      className: 'person',
      color: '#99d334',
      confidence: 0.93,
      left: 0.25,
      right: 0.75,
      top: 0.5,
    }]);
    expect(await results[1]?.overlay.text()).toBe('overlay-b');
  });
});
