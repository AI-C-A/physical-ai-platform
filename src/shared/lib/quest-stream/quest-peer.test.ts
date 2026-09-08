import { afterEach, expect, it, vi } from 'vitest';
import { QuestPeer } from './quest-peer';

class Channel {
  label = 'quest-preview';
  readyState = 'open';
  bufferedAmount = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  receive(value: unknown): void { this.onmessage?.({ data: JSON.stringify(value) }); }
}
class Connection {
  static instances: Connection[] = [];
  connectionState = 'connected';
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  ondatachannel: ((event: { channel: Channel }) => void) | null = null;
  onicecandidate = null;
  channel = new Channel();
  createDataChannel = vi.fn(() => this.channel);
  createOffer = () => Promise.resolve({ type: 'offer', sdp: 'offer' });
  createAnswer = () => Promise.resolve({ type: 'answer', sdp: 'answer' });
  setLocalDescription = (value: { type: string; sdp: string }) => { this.localDescription = value; return Promise.resolve(); };
  setRemoteDescription = (value: { type: string; sdp: string }) => { this.remoteDescription = value; return Promise.resolve(); };
  addIceCandidate = vi.fn(() => Promise.resolve());
  close = vi.fn();
  constructor() { Connection.instances.push(this); }
}
const observation = { deviceMonotonicTimestampMs: 123, hands: {
  left: { sourcePresent: false, poseObserved: false, joints: [] },
  right: { sourcePresent: false, poseObserved: false, joints: [] },
} };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); Connection.instances = []; });

it('순서 대기와 재전송 없이 보내고 혼잡한 미리보기를 쌓지 않는다', async () => {
  vi.useFakeTimers(); vi.stubGlobal('RTCPeerConnection', Connection);
  const peer = new QuestPeer({ role: 'sender', signal: vi.fn(), onFrame: vi.fn() });
  peer.handle({ type: 'peer', peerId: 'viewer' });
  await vi.advanceTimersByTimeAsync(0);
  const connection = Connection.instances[0]!;
  expect(connection.createDataChannel).toHaveBeenCalledWith('quest-preview', { ordered: false, maxRetransmits: 0 });
  peer.publish(observation);
  connection.channel.bufferedAmount = 100;
  peer.publish(observation);
  expect(connection.channel.send).toHaveBeenCalledOnce();
  peer.close();
  expect(connection.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('역순 패킷과 잘못된 관절을 버리고 종료 뒤 수신을 반영하지 않는다', async () => {
  vi.useFakeTimers(); vi.stubGlobal('RTCPeerConnection', Connection);
  const onFrame = vi.fn();
  const peer = new QuestPeer({ role: 'viewer', signal: vi.fn(), onFrame });
  peer.handle({ type: 'signal', peerId: 'sender', signal: { type: 'offer', sdp: 'offer' } });
  await vi.advanceTimersByTimeAsync(0);
  const connection = Connection.instances[0]!;
  const channel = connection.channel;
  connection.ondatachannel?.({ channel });
  channel.receive({ type: 'frame', sequence: 10, observation });
  channel.receive({ type: 'frame', sequence: 9, observation });
  channel.receive({ type: 'frame', sequence: 11, observation: { hands: null } });
  expect(onFrame).toHaveBeenCalledOnce();
  peer.close();
  channel.receive({ type: 'frame', sequence: 12, observation });
  expect(onFrame).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
