import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimulationCodeClient } from './simulation-code-client';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) { this.url = url; FakeSocket.instances.push(this); }
  open(): void { this.readyState = 1; this.onopen?.(); }
  receive(obj: unknown): void { this.onmessage?.({ data: JSON.stringify(obj) } as MessageEvent<unknown>); }
  send(data: string): void { this.sent.push(data); }
  close(): void { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  get outgoing(): { t?: string }[] { return this.sent.map((s) => JSON.parse(s) as { t?: string }); }
}

const make = (opts: { initialCode?: string; onCode?: (code: string) => void } = {}) =>
  new SimulationCodeClient({ url: 'wss://sim/party', ...opts, createSocket: (url) => new FakeSocket(url) as unknown as WebSocket });

describe('SimulationCodeClient', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeSocket.instances = []; });
  afterEach(() => { vi.useRealTimers(); });

  it('welcome 뒤 new_code를 요청하고 발급된 코드와 공개 주소를 노출한다', () => {
    const client = make();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    expect(socket.outgoing[0]).toEqual({ t: 'hello', name: 'MONITOR', mode: 'monitor' });
    socket.receive({ t: 'welcome', id: 'm', room: 'main', code: null, publicUrl: 'https://orca.tail58a6fa.ts.net/', peers: [] });
    expect(client.getSnapshot()).toMatchObject({ status: 'connected', code: null, publicOrigin: 'https://orca.tail58a6fa.ts.net' });
    expect(socket.outgoing.at(-1)).toEqual({ t: 'new_code' });
    socket.receive({ t: 'code', code: '48213' });
    expect(client.getSnapshot().code).toBe('48213');
    client.close();
    expect(client.getSnapshot().status).toBe('closed');
  });

  it('이미 코드가 있는 방에 붙으면 new_code를 요청하지 않는다', () => {
    const client = make();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.receive({ t: 'welcome', id: 'm', room: 'code:77777', code: '77777', publicUrl: 'https://orca.tail58a6fa.ts.net', peers: [] });
    expect(client.getSnapshot().code).toBe('77777');
    expect(socket.outgoing.some((m) => m.t === 'new_code')).toBe(false);
    client.close();
  });

  it('저장된 코드로 그 방에 재접속하고, 코드를 저장 콜백으로 알린다', () => {
    const saved: string[] = [];
    const client = make({ initialCode: '48213', onCode: (c) => saved.push(c) });
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe('wss://sim/party?code=48213');
    socket.open();
    socket.receive({ t: 'welcome', id: 'm', room: 'code:48213', code: '48213', publicUrl: 'https://orca.tail58a6fa.ts.net', peers: [] });
    expect(client.getSnapshot().code).toBe('48213');
    expect(socket.outgoing.some((m) => m.t === 'new_code')).toBe(false);
    expect(saved).toContain('48213');
    client.close();
  });

  it('저장된 코드가 만료(denied)되면 코드를 버리고 새로 발급받는다', () => {
    const client = make({ initialCode: '11111' });
    const first = FakeSocket.instances[0]!;
    expect(first.url).toBe('wss://sim/party?code=11111');
    first.open();
    first.receive({ t: 'denied', reason: 'code' });
    first.close();
    vi.advanceTimersByTime(1_000);
    const second = FakeSocket.instances[1]!;
    expect(second.url).toBe('wss://sim/party');
    second.open();
    second.receive({ t: 'welcome', id: 'm', room: 'main', code: null, publicUrl: 'https://orca.tail58a6fa.ts.net', peers: [] });
    expect(second.outgoing.at(-1)).toEqual({ t: 'new_code' });
    second.receive({ t: 'code', code: '90909' });
    expect(client.getSnapshot().code).toBe('90909');
    client.close();
  });

  it('끊기면 재연결하고 닫은 뒤에는 다시 열지 않는다', () => {
    const client = make();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.receive({ t: 'welcome', id: 'm', room: 'main', code: null, peers: [] });
    FakeSocket.instances[0]!.close();
    expect(client.getSnapshot().status).toBe('reconnecting');
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.instances).toHaveLength(2);
    client.close();
    vi.advanceTimersByTime(30_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
