import { describe, expect, it, vi } from 'vitest';

import { PatrolRobotOperationalStatusQuery } from './patrol-robot-adapters';

class FakeStatusEventSource {
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

  emit(type: string, value: unknown): void {
    const event = new MessageEvent(type, { data: JSON.stringify(value) });
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener);
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function createStatus(robotId: string, battery: number) {
  return {
    robotId,
    integrationProfileId: 'patrol-rest-v1',
    data: {
      id: 246,
      serialNumber: 'MOCK00001',
      name: '405',
      nickname: 'Mock Robot',
      description: null,
      battery,
      isConnecting: true,
      latitude: 0,
      longitude: 0,
      isCharging: false,
      isHeadLightOn: false,
      isCargoOpen: false,
    },
  };
}

describe('PatrolRobotOperationalStatusQuery status stream', () => {
  it('Robot 목록을 한 EventSource로 구독하고 SSE payload를 query cache에 반영한다', async () => {
    const source = new FakeStatusEventSource();
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse(createStatus('robot-01', 70))));
    let openedUrl: URL | undefined;
    let nowMs = 1_700_000_000_123;
    const query = new PatrolRobotOperationalStatusQuery({
      clock: { nowMs: () => nowMs },
      endpoint: '/api/integrations/patrol',
      eventSourceFactory: (url) => {
        openedUrl = url;
        return source;
      },
      fetcher,
    });
    const listener = vi.fn();

    const unsubscribe = query.subscribeOperationalStatuses(
      ['robot-02', 'robot-01', 'robot-02'],
      listener,
    );

    expect(openedUrl?.pathname).toMatch(/\/robot-status\/events$/);
    expect(openedUrl?.searchParams.getAll('robotId')).toEqual(['robot-01', 'robot-02']);

    source.emit('status-snapshot', createStatus('robot-01', 80));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({ kind: 'updated', robotId: 'robot-01' });
    await expect(query.getOperationalStatus('robot-01')).resolves.toMatchObject({
      robotId: 'robot-01',
      receivedTimestampMs: 1_700_000_000_123,
      data: { battery: 80 },
    });
    expect(fetcher).not.toHaveBeenCalled();

    nowMs += 3_000;
    source.emit('status-update', createStatus('robot-01', 79));
    await expect(query.getOperationalStatus('robot-01')).resolves.toMatchObject({
      receivedTimestampMs: 1_700_000_003_123,
      data: { battery: 79 },
    });

    source.emit('status-error', {
      robotId: 'robot-01',
      code: 'STATUS_POLL_FAILED',
      message: '오프라인',
      lastSuccessfulAtMs: 1_700_000_003_123,
    });
    expect(listener).toHaveBeenLastCalledWith({
      kind: 'stale',
      lastSuccessfulAtMs: 1_700_000_003_123,
      message: '오프라인',
      reason: 'status-unavailable',
      robotId: 'robot-01',
    });
    await expect(query.getOperationalStatus('robot-01')).resolves.toMatchObject({
      data: { battery: 70 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    source.emit('status-update', createStatus('robot-01', 78));
    source.emit('status-update', { robotId: 'not-subscribed' });
    source.emit('status-update', 'invalid');
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    expect(source.closed).toBe(true);
    expect(source.listeners.get('status-update')).toHaveLength(0);
    await expect(query.getOperationalStatus('robot-01')).resolves.toMatchObject({
      data: { battery: 70 },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('연결 오류는 자동 재연결하지 않고 명시적 Retry를 위해 source를 닫는다', () => {
    const source = new FakeStatusEventSource();
    const query = new PatrolRobotOperationalStatusQuery({
      clock: { nowMs: () => 1_700_000_000_123 },
      endpoint: '/api/integrations/patrol',
      eventSourceFactory: () => source,
    });
    const listener = vi.fn();
    const unsubscribe = query.subscribeOperationalStatuses(['robot-01'], listener);

    source.emit('error', null);

    expect(source.closed).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenLastCalledWith({
      kind: 'stale',
      lastSuccessfulAtMs: null,
      message: '게이트웨이 연결이 끊겼습니다.',
      reason: 'gateway-unreachable',
      robotId: 'robot-01',
    });

    source.emit('status-update', createStatus('robot-01', 79));
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    expect(source.listeners.get('error')).toHaveLength(0);
    expect(source.listeners.get('status-update')).toHaveLength(0);
  });
});
