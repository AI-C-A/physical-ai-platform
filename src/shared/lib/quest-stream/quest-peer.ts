interface PeerOptions {
  readonly role: 'sender' | 'viewer';
  readonly signal: (message: unknown) => void;
  readonly onFrame: (observation: Record<string, unknown>, roundTripMs: number | null) => void;
}

interface Peer {
  readonly connection: RTCPeerConnection;
  channel: RTCDataChannel | null;
  readonly candidates: RTCIceCandidateInit[];
  lastSequence: number;
  roundTripMs: number | null;
  timer: ReturnType<typeof setInterval> | null;
  lastPongAt: number;
  lastPing: number | null;
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const vector = (value: unknown, size: number): boolean => Array.isArray(value) && value.length === size && value.every(Number.isFinite);

/** 직접 수신에는 서버 검증이 없으므로 좌표와 손 단위 유효성을 먼저 확인한다. */
function observationIsValid(value: unknown): value is Record<string, unknown> {
  if (!object(value) || !Number.isFinite(value.deviceMonotonicTimestampMs) || !object(value.hands)) return false;
  if (value.viewerPose != null && (!object(value.viewerPose) || !vector(value.viewerPose.positionMeters, 3)
    || !vector(value.viewerPose.orientationQuaternion, 4))) return false;
  return ['left', 'right'].every((side) => {
    const hand = (value.hands as Record<string, unknown>)[side];
    return object(hand) && typeof hand.sourcePresent === 'boolean' && typeof hand.poseObserved === 'boolean'
      && (!hand.poseObserved || hand.sourcePresent) && Array.isArray(hand.joints)
      && hand.joints.length === (hand.poseObserved ? 25 : 0)
      && hand.joints.every((joint: unknown) => object(joint) && typeof joint.name === 'string'
        && vector(joint.positionMeters, 3) && vector(joint.orientationQuaternion, 4)
        && (joint.radiusMeters === null || (typeof joint.radiusMeters === 'number' && Number.isFinite(joint.radiusMeters) && joint.radiusMeters >= 0)));
  });
}

/** 같은 LAN의 host ICE 후보만 사용한다. 외부 STUN/TURN이나 인증서 설치가 필요 없다. */
export class QuestPeer {
  readonly #options: PeerOptions;
  readonly #peers = new Map<string, Peer>();
  #closed = false;
  #sequence = 0;
  #pending = Promise.resolve();

  constructor(options: PeerOptions) { this.#options = options; }

  handle(message: Record<string, unknown>): void {
    this.#pending = this.#pending.then(() => this.#handle(message)).catch(() => undefined);
  }

  #create(id: string): Peer | null {
    if (this.#closed || typeof RTCPeerConnection === 'undefined' || (!this.#peers.has(id) && this.#peers.size >= 4)) return null;
    this.#remove(id);
    const connection = new RTCPeerConnection({ iceServers: [] });
    const peer: Peer = { connection, channel: null, candidates: [], lastSequence: -1,
      roundTripMs: null, timer: null, lastPongAt: performance.now(), lastPing: null };
    this.#peers.set(id, peer);
    connection.onicecandidate = ({ candidate }) => {
      if (candidate && this.#peers.get(id) === peer) this.#options.signal({ type: 'signal', peerId: id,
        signal: { type: 'candidate', candidate: candidate.toJSON() } });
    };
    connection.ondatachannel = ({ channel }) => this.#bind(id, peer, channel);
    // 직접 연결이 끊겨도 중계 경로가 동작하며, sender가 주기적으로 다시 협상한다.
    peer.timer = setInterval(() => {
      if (this.#options.role === 'sender') {
        if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected'
          || performance.now() - peer.lastPongAt > 8_000) {
          this.handle({ type: 'peer', peerId: id });
        }
      } else if (peer.channel?.readyState === 'open' && peer.channel.bufferedAmount === 0) {
        peer.lastPing = performance.now();
        peer.channel.send(JSON.stringify({ type: 'ping', at: peer.lastPing }));
      }
    }, 1_000);
    return peer;
  }

  #bind(id: string, peer: Peer, channel: RTCDataChannel): void {
    if (this.#peers.get(id) !== peer || channel.label !== 'quest-preview') { channel.close(); return; }
    peer.channel = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (this.#closed || this.#peers.get(id) !== peer || typeof event.data !== 'string' || event.data.length > 32_768) return;
      try {
        const message: unknown = JSON.parse(event.data);
        if (!object(message)) return;
        if (message.type === 'ping' && this.#options.role === 'sender' && Number.isFinite(message.at)) {
          peer.lastPongAt = performance.now();
          if (channel.readyState === 'open' && channel.bufferedAmount === 0) channel.send(JSON.stringify({ type: 'pong', at: message.at }));
        } else if (message.type === 'pong' && message.at === peer.lastPing && peer.lastPing !== null) {
          peer.roundTripMs = Math.max(0, performance.now() - peer.lastPing);
        } else if (message.type === 'frame' && this.#options.role === 'viewer'
          && typeof message.sequence === 'number' && Number.isSafeInteger(message.sequence)
          && message.sequence > peer.lastSequence && observationIsValid(message.observation)) {
          peer.lastSequence = message.sequence;
          this.#options.onFrame(message.observation, peer.roundTripMs);
        }
      } catch { /* 손상된 미리보기는 버리고 다음 유효 프레임을 기다린다. */ }
    };
  }

  async #handle(message: Record<string, unknown>): Promise<void> {
    const id = message.peerId;
    if (this.#closed || typeof id !== 'string') return;
    if (message.type === 'peer-left') { this.#remove(id); return; }
    if (message.type === 'peer' && this.#options.role === 'sender') {
      const peer = this.#create(id);
      if (!peer) return;
      this.#bind(id, peer, peer.connection.createDataChannel('quest-preview', { ordered: false, maxRetransmits: 0 }));
      await peer.connection.setLocalDescription(await peer.connection.createOffer());
      if (this.#peers.get(id) === peer) this.#options.signal({ type: 'signal', peerId: id,
        signal: { type: 'offer', sdp: peer.connection.localDescription?.sdp } });
      return;
    }
    const signal = message.signal;
    if (message.type !== 'signal' || !object(signal)) return;
    let peer = this.#peers.get(id);
    if (signal.type === 'offer' && this.#options.role === 'viewer' && typeof signal.sdp === 'string') {
      peer = this.#create(id) ?? undefined;
      if (!peer) return;
      await peer.connection.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      await peer.connection.setLocalDescription(await peer.connection.createAnswer());
      if (this.#peers.get(id) === peer) this.#options.signal({ type: 'signal', peerId: id,
        signal: { type: 'answer', sdp: peer.connection.localDescription?.sdp } });
    } else if (peer && signal.type === 'answer' && this.#options.role === 'sender' && typeof signal.sdp === 'string') {
      await peer.connection.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    } else if (peer && signal.type === 'candidate' && object(signal.candidate)) {
      const candidate = signal.candidate as RTCIceCandidateInit;
      if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(candidate);
      else if (peer.candidates.length < 32) peer.candidates.push(candidate);
    }
    if (peer?.connection.remoteDescription) {
      for (const candidate of peer.candidates.splice(0)) await peer.connection.addIceCandidate(candidate);
    }
  }

  get connected(): boolean {
    return [...this.#peers.values()].some((peer) => peer.channel?.readyState === 'open');
  }

  publish(observation: unknown): void {
    if (!this.connected) return;
    const payload = JSON.stringify({ type: 'frame', sequence: this.#sequence++, observation });
    for (const peer of this.#peers.values()) {
      if (peer.channel?.readyState === 'open' && peer.channel.bufferedAmount === 0) peer.channel.send(payload);
    }
  }

  #remove(id: string): void {
    const peer = this.#peers.get(id);
    if (!peer) return;
    this.#peers.delete(id);
    if (peer.timer !== null) clearInterval(peer.timer);
    peer.channel?.close();
    peer.connection.close();
  }

  close(): void {
    this.#closed = true;
    for (const id of this.#peers.keys()) this.#remove(id);
  }
}
