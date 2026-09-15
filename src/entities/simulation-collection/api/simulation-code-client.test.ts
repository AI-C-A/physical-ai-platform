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

const make = () => new SimulationCodeClient({ url: 'wss://sim/party', createSocket: (url) => new FakeSocket(url) as unknown as WebSocket });

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
