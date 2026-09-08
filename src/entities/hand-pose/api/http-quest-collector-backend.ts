import { QuestStream } from '@/shared/lib/quest-stream';
import type {
  QuestCollectorBackendPort,
  QuestCollectorCommandState,
  QuestPairingResult,
} from '../model/hand-pose';
import type { QuestLivePreviewPort, QuestLiveSession, QuestLiveSnapshot } from '../model/quest-live-preview';

interface SenderCredentials {
  readonly sessionId: string;
  readonly senderToken: string;
  readonly sourceDeviceId?: string;
  readonly collection?: boolean;
}

export class HttpQuestCollectorBackend implements QuestCollectorBackendPort, QuestLivePreviewPort {
  readonly availability = 'available' as const;
  readonly #endpoint: string;
  #stream: QuestStream | null = null;
  #sender: SenderCredentials | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #preview: Promise<{ readonly receivedTimestampMs: number }> | null = null;
  #presenceSequence = 0;
  readonly #listeners = new Set<() => void>();

  constructor(endpoint = '/api/quest') {
    this.#endpoint = endpoint.replace(/\/$/u, '');
  }

  async #request<T>(path: string, method: string, token?: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.#endpoint}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      },
      cache: 'no-store',
      signal: signal === undefined ? AbortSignal.timeout(5_000) : AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      keepalive: method === 'DELETE' || path.endsWith('/presence'),
    });
    if (!response.ok) {
      const result: unknown = await response.json().catch(() => null);
      const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
        ? result.message : '손 추적 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
      throw new Error(message);
    }
    return response.json() as Promise<T>;
  }

  createSession(): Promise<QuestLiveSession> {
    return this.#request('/sessions', 'POST', undefined, {});
  }

  readSession(session: QuestLiveSession, signal: AbortSignal): Promise<QuestLiveSnapshot> {
    return this.#request(`/sessions/${session.sessionId}`, 'GET', session.viewerToken, undefined, signal);
  }

  subscribeSession(session: QuestLiveSession, listener: (snapshot: QuestLiveSnapshot) => void): () => void {
    const stream = new QuestStream({ endpoint: this.#endpoint, sessionId: session.sessionId,
      token: session.viewerToken, role: 'viewer', onSnapshot: (value) => {
        if (typeof value !== 'object' || value === null || !('frameCount' in value)
          || typeof value.frameCount !== 'number' || !('sourceState' in value) || !('frame' in value)) return;
        listener(value as QuestLiveSnapshot);
      } });
    return () => stream.close();
  }

  closeSession(session: QuestLiveSession): Promise<void> {
    return this.#request(`/sessions/${session.sessionId}`, 'DELETE', session.viewerToken);
  }

  async pair(pairingCode: string): Promise<QuestPairingResult> {
    const sender = await this.#request<SenderCredentials>(
      '/pair', 'POST', undefined, { pairingCode },
    );
    this.#sender = sender;
    return {
      collection: sender.collection === true,
      sessionId: sender.sessionId, sourceDeviceId: sender.sourceDeviceId ?? `quest-${sender.sessionId}`, participantId: sender.sessionId,
      activeEpisodeId: null,
      policy: {
        targetRateHz: 60, queueCapacityFrames: 600, maximumBatchFrames: 64,
        flushIntervalMs: 50, partialAfterMs: 250, lostAfterMs: 1_500,
      },
    };
  }

  async connect(pairing: QuestPairingResult): Promise<void> {
    await this.getCommandState(pairing);
    this.#stream?.close();
    this.#stream = new QuestStream({ endpoint: this.#endpoint, sessionId: pairing.sessionId,
      token: this.#senderToken(pairing), role: 'sender', onSnapshot: () => undefined });
    if (this.#timer === null) {
      this.#timer = setInterval(() => this.#listeners.forEach((listener) => listener()), 1_000);
    }
  }

  disconnect(): void {
    this.#stream?.close();
    this.#stream = null;
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #senderToken(pairing: QuestPairingResult): string {
    if (this.#sender?.sessionId !== pairing.sessionId) throw new Error('Quest 세션에 다시 연결하세요.');
    return this.#sender.senderToken;
  }

  async getCommandState(pairing: QuestPairingResult): Promise<QuestCollectorCommandState> {
    const state = await this.#request<QuestLiveSnapshot>(
      `/sessions/${pairing.sessionId}`, 'GET', this.#senderToken(pairing),
    );
    return { sessionId: state.sessionId, activeEpisodeId: state.activeEpisodeId ?? null, sourceState: state.sourceState };
  }

  acknowledge(input?: Parameters<QuestCollectorBackendPort['acknowledge']>[0]): Promise<void> {
    if (!this.#sender?.collection || input?.sessionId !== this.#sender.sessionId) {
      return Promise.reject(new Error('수집 세션에 연결한 뒤 녹화를 시작하세요.'));
    }
    return this.#request(`/sessions/${input.sessionId}/acknowledgements`, 'POST', this.#sender.senderToken, input);
  }

  sendHandPoseBatch(input?: Parameters<QuestCollectorBackendPort['sendHandPoseBatch']>[0]): Promise<{ readonly receivedTimestampMs: number }> {
    if (!this.#sender?.collection || input === undefined) {
      return Promise.reject(new Error('실시간 손 추적 연결은 Episode 원본 저장을 지원하지 않습니다.'));
    }
    return this.#request(`/sessions/${input.pairing.sessionId}/batches`, 'POST', this.#senderToken(input.pairing), { frames: input.frames });
  }

  streamHandPosePreview(observation: Parameters<NonNullable<QuestCollectorBackendPort['streamHandPosePreview']>>[0]): boolean {
    return this.#stream?.publish(observation) ?? false;
  }

  sendHandPosePreview(input: Parameters<QuestCollectorBackendPort['sendHandPosePreview']>[0]): Promise<{ readonly receivedTimestampMs: number }> {
    const preview = this.#request<{ readonly receivedTimestampMs: number }>(
      `/sessions/${input.pairing.sessionId}/frames`, 'POST', this.#senderToken(input.pairing), input.observation,
    ).finally(() => {
      if (this.#preview === preview) this.#preview = null;
    });
    this.#preview = preview;
    return preview;
  }

  async updatePresence(pairing: QuestPairingResult, state: QuestCollectorCommandState['sourceState']): Promise<void> {
    const sequence = ++this.#presenceSequence;
    if (state === 'offline' || state === 'stale') await this.#preview?.catch(() => undefined);
    if (sequence !== this.#presenceSequence) return;
    await this.#request(`/sessions/${pairing.sessionId}/presence`, 'POST', this.#senderToken(pairing), { state });
  }
}
