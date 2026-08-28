import { describe, expect, it, vi } from 'vitest';

import type { RobotEvent } from '../model/robot-event';
import { PatrolRobotEventRepository } from './patrol-robot-event-repository';

const endpoint = '/api/integrations/patrol';
const event: RobotEvent = {
  id: 'event-1',
  robotId: 'robot-01',
  type: 'warning',
  occurredAtMs: 1_000,
  title: '[ADS-1] 배터리 부족',
  detail: '배터리 잔량이 20%로 임계치 20% 이하입니다.',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

class FakeEventSource {
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  closed = false;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      const event = new MessageEvent(type, { data });
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener);
  }
}

describe('PatrolRobotEventRepository', () => {
  it('조회 조건을 Gateway query로 전달하고 검증된 페이지를 반환한다', async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(jsonResponse({
      items: [event],
      page: 2,
      pageSize: 20,
      totalItems: 21,
      totalPages: 2,
    })));
    const repository = new PatrolRobotEventRepository({ endpoint, fetcher });

    await expect(repository.queryEvents({
      page: 2,
      pageSize: 20,
      robotId: 'robot-01',
      startMs: 500,
      type: 'warning',
    })).resolves.toEqual({
      items: [event],
      page: 2,
      pageSize: 20,
      totalItems: 21,
      totalPages: 2,
    });

    const [input] = fetcher.mock.calls[0] ?? [];
    expect(input).toBeInstanceOf(URL);
    if (!(input instanceof URL)) throw new Error('이벤트 조회 URL이 필요합니다.');
    expect(input.pathname).toMatch(/\/events$/u);
    expect(Object.fromEntries(input.searchParams)).toEqual({
      page: '2',
      pageSize: '20',
      robotId: 'robot-01',
      startMs: '500',
      type: 'warning',
    });
  });

  it('잘못된 Gateway 이벤트 shape를 내부 상세 없이 거절한다', async () => {
    const repository = new PatrolRobotEventRepository({
      endpoint,
      fetcher: () => Promise.resolve(jsonResponse({
        items: [{ ...event, type: 'critical' }],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      })),
    });

    await expect(repository.queryEvents({
      page: 1,
      pageSize: 20,
      robotId: null,
      startMs: null,
      type: null,
    })).rejects.toThrow('이벤트를 불러오지 못했습니다.');
    await expect(repository.queryEvents({
      page: 1,
      pageSize: 20,
      robotId: null,
      startMs: null,
      type: null,
    })).rejects.not.toThrow(/critical|type/u);
  });

  it('유효한 새 이벤트만 변경 알림으로 전달하고 해제 시 SSE를 정리한다', () => {
    const source = new FakeEventSource();
    const eventSourceFactory = vi.fn<(url: URL) => FakeEventSource>(() => source);
    const listener = vi.fn();
    const repository = new PatrolRobotEventRepository({
      endpoint,
      eventSourceFactory,
    });

    const unsubscribe = repository.subscribe(listener);
    source.emit('event-created', JSON.stringify({ ...event, type: 'unknown' }));
    source.emit('event-created', JSON.stringify(event));

    expect(listener).toHaveBeenCalledOnce();
    const [url] = eventSourceFactory.mock.calls[0] ?? [];
    if (!(url instanceof URL)) throw new Error('이벤트 stream URL이 필요합니다.');
    expect(url.pathname).toMatch(/\/events\/stream$/u);

    unsubscribe();
    source.emit('event-created', JSON.stringify(event));
    expect(listener).toHaveBeenCalledOnce();
    expect(source.closed).toBe(true);
  });
});
