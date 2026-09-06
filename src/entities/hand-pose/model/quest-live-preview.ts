import type { WebXrFrameObservation } from './hand-pose';

export interface QuestLiveSession {
  readonly sessionId: string;
  readonly pairingCode: string;
  readonly viewerToken: string;
  readonly expiresAtMs: number;
  readonly pairingExpiresAtMs: number;
}

export interface QuestLiveSnapshot {
  readonly sessionId: string;
  readonly sourceState: 'pending' | 'paired' | 'ready' | 'recording' | 'offline' | 'stale';
  readonly activeEpisodeId?: string | null;
  readonly frameCount: number;
  readonly frame: {
    readonly coordinateFrame: 'quest-local-floor';
    readonly deviceTimestampMs: number;
    readonly receivedTimestampMs: number;
    readonly hands: WebXrFrameObservation['hands'];
  } | null;
}

export interface QuestLivePreviewPort {
  createSession(): Promise<QuestLiveSession>;
  readSession(session: QuestLiveSession, signal: AbortSignal): Promise<QuestLiveSnapshot>;
  closeSession(session: QuestLiveSession): Promise<void>;
}
