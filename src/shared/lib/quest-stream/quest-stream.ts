import { QuestPeer } from './quest-peer';

interface StreamOptions {
  readonly endpoint: string;
  readonly sessionId: string;
  readonly token: string;
  readonly role: 'sender' | 'viewer';
  readonly onSnapshot: (value: unknown) => void;
}

/** 토큰은 URL에 넣지 않는다. 재연결 시에도 이전 손 프레임은 재전송하지 않는다. */
export class QuestStream {
  #socket: WebSocket | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #watchdog: ReturnType<typeof setInterval> | null = null;
  #closed = false;
  #ready = false;
  #lastMessageAt = 0;
  #nextSendAt = 0;
  #nextRelayAt = 0;
  #sequence = 0;
  #awaiting: { sequence: number; at: number } | null = null;
  #modern = false;
  #roundTripMs: number | null = null;
  #peer: QuestPeer | null = null;
  #directAt = -Infinity;
  #directCount = 0;
  #lastSnapshot: Record<string, unknown> | null = null;
  #pendingSnapshot: unknown = null;
  #paint: number | null = null;
  readonly #options: StreamOptions;

  constructor(options: StreamOptions) {
    this.#options = options;
    this.#connect();
  }

  #deliver(value: unknown): void {
    this.#pendingSnapshot = value;
    if (this.#paint !== null) return;
    this.#paint = requestAnimationFrame(() => {
      this.#paint = null;
      if (!this.#closed) this.#options.onSnapshot(this.#pendingSnapshot);
      this.#pendingSnapshot = null;
    });
  }

  #connect(): void {
    if (this.#closed || typeof WebSocket === 'undefined') return;
    this.#timer = null;
    const url = new URL(`${this.#options.endpoint}/stream`, globalThis.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    this.#socket = socket;
    this.#lastMessageAt = Date.now();
    this.#awaiting = null;
    this.#peer = new QuestPeer({ role: this.#options.role,
      signal: (message) => {
        if (this.#ready && socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 65_536) socket.send(JSON.stringify(message));
      },
      onFrame: (observation, roundTripMs) => {
        if (this.#closed || !this.#ready || this.#lastSnapshot?.sourceState === 'offline') return;
        this.#directAt = performance.now();
        this.#deliver({ sessionId: this.#options.sessionId,
          sourceState: this.#lastSnapshot?.sourceState === 'recording' ? 'recording' : 'ready',
          frameCount: ++this.#directCount,
          frame: { coordinateFrame: 'quest-local-floor', deviceTimestampMs: observation.deviceMonotonicTimestampMs,
            receivedTimestampMs: Date.now(), hands: observation.hands, viewerPose: observation.viewerPose,
            delivery: { transport: 'webrtc', roundTripMs } } });
      } });
    socket.onopen = () => {
      if (this.#closed) { socket.close(); return; }
      socket.send(JSON.stringify({ sessionId: this.#options.sessionId, token: this.#options.token,
        role: this.#options.role, streamProtocol: 2 }));
    };
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (this.#closed || typeof event.data !== 'string') return;
      try {
        const value: unknown = JSON.parse(event.data);
        if (typeof value !== 'object' || value === null) return;
        if ('type' in value) {
          if (value.type === 'frame-ack' && 'sequence' in value && this.#awaiting !== null && value.sequence === this.#awaiting.sequence) {
            this.#roundTripMs = performance.now() - this.#awaiting.at;
            this.#awaiting = null;
          } else if (['peer', 'peer-left', 'signal'].includes(String(value.type))) {
            this.#peer?.handle(value);
          }
          return;
        }
        if (!('sessionId' in value) || value.sessionId !== this.#options.sessionId) return;
        this.#lastMessageAt = Date.now();
        this.#ready = true;
        this.#modern = 'streamProtocol' in value && value.streamProtocol === 2;
        if ('snapshotSequence' in value) socket.send(JSON.stringify({ type: 'snapshot-ack', sequence: value.snapshotSequence }));
        this.#lastSnapshot = value;
        if (this.#lastSnapshot.sourceState === 'offline') this.#directAt = -Infinity;
        if (performance.now() - this.#directAt > 250) {
          const frame = this.#lastSnapshot.frame;
          this.#deliver({ ...value, frame: typeof frame === 'object' && frame !== null
            ? { ...frame, delivery: { transport: 'websocket', roundTripMs: this.#roundTripMs } } : null });
        }
      } catch { socket.close(); }
    };
    socket.onerror = () => socket.close();
    socket.onclose = (event) => {
      this.#ready = false;
      this.#peer?.close();
      this.#peer = null;
      this.#directAt = -Infinity;
      if (this.#watchdog !== null) clearInterval(this.#watchdog);
      this.#watchdog = null;
      if (!this.#closed && event.code !== 1008 && event.code !== 1009) {
        this.#timer = setTimeout(() => this.#connect(), 1_000);
      }
    };
    this.#watchdog = setInterval(() => {
      if (Date.now() - this.#lastMessageAt > 2_000
        || (this.#awaiting !== null && performance.now() - this.#awaiting.at > 3_000)) {
        this.#ready = false; socket.close();
      }
    }, 500);
  }

  /** true이면 실시간 경로가 처리한다. 혼잡할 때는 해당 미리보기만 버린다. */
  publish(observation: unknown): boolean {
    const socket = this.#socket;
    if (!this.#ready || socket?.readyState !== WebSocket.OPEN) return false;
    const now = performance.now();
    if (now >= this.#nextSendAt) {
      this.#peer?.publish(observation);
      this.#nextSendAt = Math.max(this.#nextSendAt + 1_000 / 60, now);
    }
    // 브라우저 bufferedAmount가 0이어도 프록시/TCP에는 데이터가 쌓일 수 있다.
    // 서버 수신 ACK 전에는 다음 미리보기를 넣지 않고 다음 XR 프레임을 기다린다.
    if (this.#awaiting === null && socket.bufferedAmount === 0 && now >= this.#nextRelayAt) {
      const sequence = this.#sequence++;
      socket.send(JSON.stringify({ type: 'frame', observation, ...(this.#modern ? { sequence } : {}) }));
      if (this.#modern) this.#awaiting = { sequence, at: now };
      this.#nextRelayAt = this.#peer?.connected ? now + 200 : Math.max(this.#nextRelayAt + 1_000 / 60, now);
    }
    return true;
  }

  close(): void {
    this.#closed = true;
    this.#ready = false;
    this.#peer?.close();
    this.#peer = null;
    if (this.#paint !== null) cancelAnimationFrame(this.#paint);
    this.#paint = null;
    this.#pendingSnapshot = null;
    if (this.#timer !== null) clearTimeout(this.#timer);
    if (this.#watchdog !== null) clearInterval(this.#watchdog);
    // CONNECTING에서 close하면 브라우저가 오류를 기록할 수 있어 open 직후 닫는다.
    if (this.#socket !== null && this.#socket.readyState === WebSocket.OPEN) this.#socket.close();
  }
}
