export type SimulationRelayState = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface SimulationSession {
  readonly status: SimulationRelayState;
  /** 릴레이가 발급한 5자리 세션 코드. 발급 전에는 null. */
  readonly code: string | null;
  /** 릴레이가 알려준 공개(Funnel) origin. 헤드셋·카메라가 열 주소의 host. 없으면 null. */
  readonly publicOrigin: string | null;
}

export interface SimulationCodeClientOptions {
  readonly url: string;
  readonly name?: string;
  readonly createSocket?: (url: string) => WebSocket;
}

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 15_000;
const CODE_RE = /^\d{5}$/u;

/**
 * 콘솔이 세션 코드를 직접 발급받는 얇은 릴레이 클라이언트.
 *
 * 데이터는 관전 iframe이 브리지로 올리므로, 이 소켓의 역할은 딱 하나다: 릴레이에 붙어
 * 5자리 코드를 받아(그 코드가 곧 방 이름) 콘솔에 즉시 보여주는 것. 헤드셋은 같은 코드를
 * 입력해 같은 방으로 들어오고, iframe도 그 코드로 열려 헤드셋 시점을 미러링한다.
 * 코드는 방이 비면 릴레이가 회수하므로, 페이지가 열려 있는 동안 소켓을 유지해 코드를 살려 둔다.
 */
export class SimulationCodeClient {
  #session: SimulationSession = { status: 'connecting', code: null, publicOrigin: null };
  #socket: WebSocket | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #backoffMs = RETRY_MIN_MS;
  #closed = false;
  #everConnected = false;
  #code: string | null = null;
  readonly #listeners = new Set<() => void>();
  readonly #options: Required<Pick<SimulationCodeClientOptions, 'name' | 'createSocket'>> & SimulationCodeClientOptions;

  constructor(options: SimulationCodeClientOptions) {
    this.#options = {
      ...options,
      name: options.name ?? 'MONITOR',
      createSocket: options.createSocket ?? ((url) => new WebSocket(url)),
    };
    this.#connect();
  }

  getSnapshot = (): SimulationSession => this.#session;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  close(): void {
    this.#closed = true;
    if (this.#retry !== null) clearTimeout(this.#retry);
    this.#retry = null;
    const socket = this.#socket;
    this.#socket = null;
    socket?.close();
    this.#set({ ...this.#session, status: 'closed' });
  }

  #connect(): void {
    if (this.#closed || typeof WebSocket === 'undefined') return;
    this.#retry = null;
    let socket: WebSocket;
    try {
      socket = this.#options.createSocket(this.#options.url);
    } catch {
      this.#scheduleRetry();
      return;
    }
    this.#socket = socket;
    this.#set({ ...this.#session, status: this.#everConnected ? 'reconnecting' : 'connecting' });
    socket.onopen = () => {
      if (this.#socket !== socket) { socket.close(); return; }
      socket.send(JSON.stringify({ t: 'hello', name: this.#options.name, mode: 'monitor' }));
    };
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (this.#socket !== socket || typeof event.data !== 'string') return;
      let value: unknown;
      try {
        value = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      const msg = value as Record<string, unknown>;
      if (msg.t === 'welcome') {
        this.#everConnected = true;
        this.#backoffMs = RETRY_MIN_MS;
        const publicOrigin = typeof msg.publicUrl === 'string' && /^https?:\/\//u.test(msg.publicUrl) ? msg.publicUrl.replace(/\/+$/u, '') : this.#session.publicOrigin;
        // 이미 코드가 있는 방에 붙었다면 그 코드를 그대로 쓰고, 없으면 새로 발급받는다.
        if (typeof msg.code === 'string' && CODE_RE.test(msg.code)) this.#code = msg.code;
        this.#set({ status: 'connected', code: this.#code, publicOrigin });
        if (this.#code === null && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'new_code' }));
      } else if (msg.t === 'code' && typeof msg.code === 'string' && CODE_RE.test(msg.code)) {
        this.#code = msg.code;
        this.#set({ ...this.#session, status: 'connected', code: msg.code });
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      if (this.#closed) return;
      this.#set({ ...this.#session, status: 'reconnecting' });
      this.#scheduleRetry();
    };
  }

  #scheduleRetry(): void {
    if (this.#closed || this.#retry !== null) return;
    this.#retry = setTimeout(() => this.#connect(), this.#backoffMs);
    this.#backoffMs = Math.min(RETRY_MAX_MS, this.#backoffMs * 1.7);
  }

  #set(next: SimulationSession): void {
    if (next.status === this.#session.status && next.code === this.#session.code && next.publicOrigin === this.#session.publicOrigin) return;
    this.#session = next;
    for (const listener of this.#listeners) listener();
  }
}
