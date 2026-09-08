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
    readonly delivery?: { readonly transport: 'webrtc' | 'websocket'; readonly roundTripMs: number | null };
    readonly coordinateFrame: 'quest-local-floor';
    readonly deviceTimestampMs: number;
    readonly receivedTimestampMs: number;
    readonly viewerPose?: Exclude<WebXrFrameObservation['viewerPose'], undefined>;
    readonly hands: WebXrFrameObservation['hands'];
  } | null;
}

export interface QuestLivePreviewPort {
  createSession(): Promise<QuestLiveSession>;
  readSession(session: QuestLiveSession, signal: AbortSignal): Promise<QuestLiveSnapshot>;
  subscribeSession?(session: QuestLiveSession, listener: (snapshot: QuestLiveSnapshot) => void): () => void;
  closeSession(session: QuestLiveSession): Promise<void>;
}
