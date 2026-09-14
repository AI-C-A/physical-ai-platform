import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimulationPartyClient } from './simulation-party-client';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent<unknown>);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }

  get sentJson(): unknown[] {
    return this.sent.map((item): unknown => JSON.parse(item));
  }
}

function createClient(nowMs = () => 5_000) {
  return new SimulationPartyClient({
    url: 'wss://sim.example/party?room=r', name: 'COLLECTOR', ignoredPeerNames: ['MONITOR'], nowMs,
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket, notifyIntervalMs: 100,
  });
}

describe('SimulationPartyClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('접속하면 관전자로 인사하고 welcome 이후 상태를 묶어서 알린다', () => {
    const client = createClient();
    const listener = vi.fn();
    client.subscribe(listener);
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe('wss://sim.example/party?room=r');
    socket.open();
    expect(socket.sentJson).toEqual([{ t: 'hello', name: 'COLLECTOR', mode: 'monitor' }]);
    socket.receive({ t: 'welcome', id: 'me', room: 'r', peers: [{ id: 'quest', name: 'OP-1', mode: 'vr' }] });
    socket.receive({ t: 'pose', from: 'quest', h: [0, 0, 0], hands: [], held: [] });
    socket.receive({ t: 'pose', from: 'quest', h: [0, 0, 0], hands: [], held: [] });
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(client.getSnapshot()).toMatchObject({ relay: 'connected', selfId: 'me', frameCount: 2 });
    client.close();
    expect(client.getSnapshot().relay).toBe('closed');
    expect(socket.readyState).toBe(3);
  });

  it('스냅샷 요청을 다른 시뮬레이션 참가자에게 넘기고 답을 요청자에게 돌려준다', () => {
    const client = createClient();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.receive({ t: 'welcome', id: 'me', room: 'r', peers: [{ id: 'stage', name: 'MONITOR', mode: 'desktop' }] });
    socket.receive({ t: 'join', id: 'quest', name: 'OP-1', mode: 'vr' });
    socket.receive({ t: 'need_state', from: 'quest' });
    expect(socket.sentJson.at(-1)).toEqual({ t: 'need_state', to: 'stage' });
    socket.receive({ t: 'state', from: 'stage', to: 'me', objects: [{ i: 1 }], knobs: [], latches: [], task: null });
    expect(socket.sentJson.at(-1)).toEqual({ t: 'state', to: 'quest', objects: [{ i: 1 }], knobs: [], latches: [], task: null });

    // 답할 참가자가 없으면 요청을 흘려보내고, 뒤늦은 스냅샷도 아무에게도 보내지 않는다.
    socket.receive({ t: 'leave', id: 'stage' });
    const before = socket.sent.length;
    socket.receive({ t: 'need_state', from: 'quest' });
    socket.receive({ t: 'state', from: 'quest', objects: [] });
    expect(socket.sent).toHaveLength(before);
    client.close();
  });

  it('끊기면 재연결하고 닫은 뒤에는 다시 열지 않는다', () => {
    const client = createClient();
    const first = FakeSocket.instances[0]!;
    first.open();
    first.receive({ t: 'welcome', id: 'me', room: 'r', peers: [] });
    first.close();
    expect(client.getSnapshot()).toMatchObject({ relay: 'reconnecting', selfId: null });
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.instances).toHaveLength(2);
    const second = FakeSocket.instances[1]!;
    second.open();
    second.receive({ t: 'welcome', id: 'me2', room: 'r', peers: [] });
    expect(client.getSnapshot()).toMatchObject({ relay: 'connected', selfId: 'me2' });
    client.close();
    vi.advanceTimersByTime(30_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('형식이 깨진 메시지는 연결을 유지한 채 무시한다', () => {
    const client = createClient();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.onmessage?.({ data: '{not json' } as MessageEvent<unknown>);
    socket.receive({ t: 'pose' });
    vi.advanceTimersByTime(100);
    expect(socket.readyState).toBe(1);
    expect(client.getSnapshot().frameCount).toBe(0);
    client.close();
  });
});
