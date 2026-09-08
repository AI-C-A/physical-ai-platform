import { afterEach, expect, it, vi } from 'vitest';
import { QuestStream } from './quest-stream';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  readonly url: URL;
  constructor(url: URL) { this.url = url; Socket.instances.push(this); }
  open(): void { this.readyState = 1; this.onopen?.(); }
  message(value: unknown = { sessionId: 'session' }): void { this.onmessage?.({ data: JSON.stringify(value) }); }
  close(code = 1000): void { this.readyState = 3; this.onclose?.({ code }); }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); Socket.instances = []; });

function setup() {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const onSnapshot = vi.fn();
  const stream = new QuestStream({ endpoint: '/api/quest', sessionId: 'session', token: 'secret', role: 'sender', onSnapshot });
  const socket = Socket.instances[0]!;
  return { stream, socket, onSnapshot };
}

it('인증 후에만 보내고 혼잡한 미리보기는 쌓지 않는다', () => {
  const { stream, socket, onSnapshot } = setup();
  expect(socket.url.toString()).not.toContain('secret');
  expect(stream.publish({ timestamp: 0 })).toBe(false);
  socket.open();
  expect(stream.publish({ timestamp: 0 })).toBe(false);
  socket.message();
  vi.advanceTimersByTime(17);
  expect(onSnapshot).toHaveBeenCalledOnce();
  expect(stream.publish({ timestamp: 1 })).toBe(true);
  expect(socket.send).toHaveBeenCalledTimes(2);
  socket.bufferedAmount = 50_000;
  vi.advanceTimersByTime(20);
  stream.publish({ timestamp: 2 });
  expect(socket.send).toHaveBeenCalledTimes(2);
  socket.bufferedAmount = 0;
  stream.publish({ timestamp: 3 });
  expect(socket.send).toHaveBeenLastCalledWith('{"type":"frame","observation":{"timestamp":3}}');
  stream.close();
  expect(vi.getTimerCount()).toBe(0);
});

it('끊긴 연결은 새로 인증하며 종료 뒤 다시 연결하지 않는다', () => {
  const { stream, socket } = setup();
  socket.open(); socket.message(); socket.close();
  expect(stream.publish({})).toBe(false);
  vi.advanceTimersByTime(1_000);
  const replacement = Socket.instances[1]!;
  replacement.open(); replacement.message();
  expect(replacement.send).toHaveBeenCalledOnce();
  stream.close();
  vi.advanceTimersByTime(5_000);
  expect(Socket.instances).toHaveLength(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('응답이 멎으면 HTTP 대체 경로를 허용하고 재연결한다', () => {
  const { stream, socket } = setup();
  socket.open(); socket.message();
  vi.advanceTimersByTime(2_500);
  expect(stream.publish({})).toBe(false);
  stream.close();
  expect(vi.getTimerCount()).toBe(0);
});

it('연결 도중 화면을 나가도 뒤늦게 열린 소켓이 살아남지 않는다', () => {
  const { stream, socket } = setup();
  stream.close(); socket.open();
  expect(socket.readyState).toBe(3);
  expect(socket.send).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('만료된 인증을 무한히 재시도하지 않는다', () => {
  const { stream, socket } = setup();
  socket.open(); socket.close(1008);
  vi.advanceTimersByTime(5_000);
  expect(Socket.instances).toHaveLength(1);
  expect(stream.publish({})).toBe(false);
  stream.close();
  expect(vi.getTimerCount()).toBe(0);
});

it('프록시가 느려도 ACK 전에는 한 프레임만 보내고 다음에는 최신 프레임을 보낸다', () => {
  const { stream, socket } = setup();
  socket.open(); socket.message({ sessionId: 'session', streamProtocol: 2, snapshotSequence: 1 });
  stream.publish({ timestamp: 0 });
  for (let timestamp = 1; timestamp <= 60; timestamp += 1) {
    vi.advanceTimersByTime(16);
    stream.publish({ timestamp });
  }
  const frames = () => socket.send.mock.calls.map(([payload]) => JSON.parse(String(payload)) as { type: string; observation: unknown }).filter((value) => value.type === 'frame');
  expect(frames()).toHaveLength(1);
  socket.message({ type: 'frame-ack', sequence: 0 });
  stream.publish({ timestamp: 61 });
  expect(frames()).toHaveLength(2);
  expect(frames()[1]?.observation).toEqual({ timestamp: 61 });
  stream.close();
});

it('렌더링이 밀려도 이전 프레임을 줄줄이 반영하지 않는다', () => {
  const { stream, socket, onSnapshot } = setup();
  socket.open();
  for (let frameCount = 0; frameCount < 100; frameCount += 1) socket.message({ sessionId: 'session', frameCount });
  expect(onSnapshot).not.toHaveBeenCalled();
  vi.advanceTimersByTime(17);
  expect(onSnapshot).toHaveBeenCalledOnce();
  expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ frameCount: 99 }));
  stream.close();
});
