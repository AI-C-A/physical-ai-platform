import {
  INITIAL_SIMULATION_MONITOR_STATE,
  reduceSimulationMonitor,
  setSimulationRelayState,
  type SimulationMonitorState,
} from '../model/simulation-monitor';
import { parseSimulationPartyMessage } from '../model/simulation-party';

export interface SimulationPartyClientOptions {
  readonly url: string;
  /** 릴레이에 알리는 표시 이름. 시뮬레이션 화면에는 이 이름의 참가자로 보인다. */
  readonly name: string;
  /** 통계에서 제외할 참가자 이름. 같은 PC에서 띄운 시뮬레이션 iframe이 여기에 해당한다. */
  readonly ignoredPeerNames?: readonly string[];
  readonly nowMs?: () => number;
  readonly createSocket?: (url: string) => WebSocket;
  /** 화면 갱신 최소 간격. 자세는 20 Hz로 오므로 그대로 그리면 페이지 전체가 흔들린다. */
  readonly notifyIntervalMs?: number;
}

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 15_000;

/**
 * 시뮬레이션 협업 릴레이에 관전자로 참가해 방의 수집 상황을 상태로 유지한다.
 *
 * 릴레이는 늦게 들어온 참가자에게 "가장 오래된 참가자"에게 월드 스냅샷을 요청하게 한다.
 * 모니터가 그 자리에 있으면 스냅샷을 만들 수 없으므로, 요청을 다른 시뮬레이션 참가자에게
 * 넘기고 돌아온 스냅샷을 원래 요청자에게 되돌려 준다.
 */
export class SimulationPartyClient {
  #state: SimulationMonitorState = INITIAL_SIMULATION_MONITOR_STATE;
  #socket: WebSocket | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #backoffMs = RETRY_MIN_MS;
  #closed = false;
  #everConnected = false;
  readonly #listeners = new Set<() => void>();
  #notifyTimer: ReturnType<typeof setTimeout> | null = null;
  #dirty = false;
  #pendingStateRequesters: string[] = [];
  readonly #options: Required<Pick<SimulationPartyClientOptions, 'ignoredPeerNames' | 'nowMs' | 'createSocket' | 'notifyIntervalMs'>>
    & SimulationPartyClientOptions;

  constructor(options: SimulationPartyClientOptions) {
    this.#options = {
      ...options,
      ignoredPeerNames: options.ignoredPeerNames ?? [],
      nowMs: options.nowMs ?? (() => Date.now()),
      createSocket: options.createSocket ?? ((url) => new WebSocket(url)),
      notifyIntervalMs: options.notifyIntervalMs ?? 100,
    };
    this.#connect();
  }

  getSnapshot = (): SimulationMonitorState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  close(): void {
    this.#closed = true;
    if (this.#retry !== null) clearTimeout(this.#retry);
    this.#retry = null;
    if (this.#notifyTimer !== null) clearTimeout(this.#notifyTimer);
    this.#notifyTimer = null;
    const socket = this.#socket;
    this.#socket = null;
    socket?.close();
    this.#state = setSimulationRelayState(this.#state, 'closed');
    this.#dirty = true;
    this.#flush();
  }

  #connect(): void {
    if (this.#closed) return;
    this.#retry = null;
    let socket: WebSocket;
    try {
      socket = this.#options.createSocket(this.#options.url);
    } catch {
      this.#scheduleRetry();
      return;
    }
    this.#socket = socket;
    this.#update(setSimulationRelayState(this.#state, this.#everConnected ? 'reconnecting' : 'connecting'));
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
      const message = parseSimulationPartyMessage(value);
      if (message === null) return;
      if (message.t === 'welcome') {
        this.#everConnected = true;
        this.#backoffMs = RETRY_MIN_MS;
      }
      this.#update(reduceSimulationMonitor(this.#state, message, {
        nowMs: this.#options.nowMs(),
        ignoredPeerNames: this.#options.ignoredPeerNames,
      }));
      if (message.t === 'need_state') this.#relayStateRequest(socket, message.from);
      else if (message.t === 'state') this.#relayStateSnapshot(socket, message.payload);
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#pendingStateRequesters = [];
      if (this.#closed) return;
      this.#update(setSimulationRelayState(this.#state, 'reconnecting'));
      this.#scheduleRetry();
    };
  }

  #relayStateRequest(socket: WebSocket, requester: string): void {
    // 요청자 자신과 다른 모니터는 스냅샷을 만들 수 없다. 남은 참가자 중 가장 오래된 쪽에 묻는다.
    const provider = this.#state.peers.find((peer) => peer.id !== requester && peer.mode !== 'monitor');
    if (provider === undefined || socket.readyState !== WebSocket.OPEN) return;
    this.#pendingStateRequesters.push(requester);
    socket.send(JSON.stringify({ t: 'need_state', to: provider.id }));
  }

  #relayStateSnapshot(socket: WebSocket, payload: Readonly<Record<string, unknown>>): void {
    const requester = this.#pendingStateRequesters.shift();
    if (requester === undefined || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ ...payload, t: 'state', to: requester }));
  }

  #scheduleRetry(): void {
    if (this.#closed || this.#retry !== null) return;
    this.#retry = setTimeout(() => this.#connect(), this.#backoffMs);
    this.#backoffMs = Math.min(RETRY_MAX_MS, this.#backoffMs * 1.7);
  }

  #update(next: SimulationMonitorState): void {
    if (next === this.#state) return;
    this.#state = next;
    this.#dirty = true;
    if (this.#notifyTimer !== null) return;
    this.#notifyTimer = setTimeout(() => {
      this.#notifyTimer = null;
      this.#flush();
    }, this.#options.notifyIntervalMs);
  }

  #flush(): void {
    if (!this.#dirty) return;
    this.#dirty = false;
    for (const listener of this.#listeners) listener();
  }
}
