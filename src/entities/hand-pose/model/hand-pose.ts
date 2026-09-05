export const HAND_JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const;

export type HandJointName = (typeof HAND_JOINT_NAMES)[number];
export type Handedness = 'left' | 'right';

export interface HandJointPose {
  readonly name: HandJointName;
  readonly positionMeters: readonly [number, number, number];
  readonly orientationQuaternion: readonly [number, number, number, number];
  readonly radiusMeters: number | null;
}

export interface HandPoseObservation {
  readonly sourcePresent: boolean;
  /** W3C의 손 단위 pose 유효성에 맞춰 false이면 joints는 반드시 비어 있다. */
  readonly poseObserved: boolean;
  readonly joints: readonly HandJointPose[];
}

/** WebXR 객체를 노출하지 않는 Hand Pose 저장·전송용 내부 계약이다. */
export interface HandPoseFrame {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly sourceDeviceId: string;
  readonly sequence: number;
  /** XRSession animation frame의 DOMHighResTimeStamp이며 epoch time이 아니다. */
  readonly deviceMonotonicTimestampMs: number;
  readonly clockDomain: 'webxr-dom-high-res-time';
  readonly coordinateFrame: 'quest-local-floor';
  /** immersive session 재시작 시 증가하여 같은 monotonic clock 구간을 구분한다. */
  readonly frameEpoch: number;
  readonly hands: Readonly<Record<Handedness, HandPoseObservation>>;
}

export interface HandTrackingPolicy {
  readonly targetRateHz: number;
  readonly queueCapacityFrames: number;
  readonly maximumBatchFrames: number;
  readonly flushIntervalMs: number;
  readonly partialAfterMs: number;
  readonly lostAfterMs: number;
}

export interface QuestPairingResult {
  readonly sessionId: string;
  readonly sourceDeviceId: string;
  readonly participantId: string;
  readonly activeEpisodeId: string | null;
  readonly policy: HandTrackingPolicy;
}

export type QuestSupportState = 'checking' | 'supported' | 'unsupported' | 'unavailable' | 'error';
export type QuestPairingState = 'unpaired' | 'pairing' | 'paired' | 'error';
export type QuestImmersiveState = 'idle' | 'starting' | 'running' | 'ending' | 'error';
export type QuestBackendState = 'offline' | 'connecting' | 'live' | 'reconnecting' | 'unavailable' | 'error';
export type QuestRecordingState = 'idle' | 'recording' | 'review' | 'error';
export type HandTrackingQualityState = 'tracking' | 'partial' | 'lost';

export interface QuestHandStatus {
  readonly sourcePresent: boolean;
  readonly poseObserved: boolean;
  readonly qualityState: HandTrackingQualityState;
  readonly qualityBasis: 'profile-time-policy';
  readonly validJointCount: 0 | 25;
  readonly consecutiveMissingMs: number;
  readonly observedRateHz: number | null;
  readonly lastObservedAtMs: number | null;
}

export interface QuestCollectorSnapshot {
  readonly support: {
    readonly state: QuestSupportState;
    readonly secureContext: boolean;
    readonly runtimeMode: 'webxr' | 'simulated' | 'unavailable';
    readonly detail: string;
  };
  readonly pairing: {
    readonly state: QuestPairingState;
    readonly sessionId: string | null;
    readonly participantId: string | null;
    readonly sourceDeviceId: string | null;
    readonly detail: string | null;
  };
  readonly immersive: {
    readonly state: QuestImmersiveState;
    readonly detail: string | null;
  };
  readonly backend: {
    readonly state: QuestBackendState;
    readonly detail: string | null;
    readonly queuedFrameCount: number;
    readonly droppedFrameCount: number;
    readonly sentFrameCount: number;
    readonly lastReceivedTimestampMs: number | null;
  };
  readonly recording: {
    readonly state: QuestRecordingState;
    readonly episodeId: string | null;
    readonly command: 'start' | 'stop' | null;
    readonly acknowledgement: 'pending' | 'acknowledged' | 'rejected' | null;
    readonly detail: string | null;
  };
  readonly hands: Readonly<Record<Handedness, QuestHandStatus>>;
}

export interface WebXrFrameObservation {
  readonly deviceMonotonicTimestampMs: number;
  readonly hands: Readonly<Record<Handedness, HandPoseObservation>>;
}

export interface ActiveWebXrSession {
  end(): Promise<void>;
}

export interface WebXrRuntimePort {
  readonly mode: 'webxr' | 'simulated' | 'unavailable';
  checkSupport(): Promise<{
    readonly supported: boolean;
    readonly secureContext: boolean;
    readonly detail: string;
  }>;
  start(
    onFrame: (observation: WebXrFrameObservation) => void,
    onEnded: () => void,
  ): Promise<ActiveWebXrSession>;
}

export interface QuestCollectorCommandState {
  readonly sessionId: string;
  readonly activeEpisodeId: string | null;
  readonly sourceState: 'pending' | 'paired' | 'ready' | 'recording' | 'stale' | 'offline' | 'error';
}

export interface QuestCollectorBackendPort {
  readonly availability: 'available' | 'unavailable';
  pair(pairingCode: string): Promise<QuestPairingResult>;
  connect(pairing: QuestPairingResult): Promise<void>;
  disconnect(): void;
  getCommandState(pairing: QuestPairingResult): Promise<QuestCollectorCommandState>;
  subscribe(listener: () => void): () => void;
  acknowledge(input: {
    readonly sessionId: string;
    readonly episodeId: string;
    readonly sourceDeviceId: string;
    readonly command: 'start' | 'stop';
    readonly state: 'acknowledged' | 'rejected';
    readonly detail: string | null;
  }): Promise<void>;
  sendHandPoseBatch(input: {
    readonly pairing: QuestPairingResult;
    readonly frames: readonly HandPoseFrame[];
    readonly payload: ArrayBuffer;
  }): Promise<{ readonly receivedTimestampMs: number }>;
  sendHandPosePreview(input: {
    readonly pairing: QuestPairingResult;
    readonly observation: WebXrFrameObservation;
  }): Promise<{ readonly receivedTimestampMs: number }>;
  updatePresence(
    pairing: QuestPairingResult,
    state: QuestCollectorCommandState['sourceState'],
  ): Promise<void>;
}

export interface QuestCollectorPort {
  getSnapshot(): QuestCollectorSnapshot;
  checkSupport(): Promise<QuestCollectorSnapshot>;
  pair(pairingCode: string): Promise<QuestCollectorSnapshot>;
  startImmersiveSession(): Promise<QuestCollectorSnapshot>;
  endImmersiveSession(): Promise<QuestCollectorSnapshot>;
  reconnectBackend(): Promise<QuestCollectorSnapshot>;
  leaveCollector(): void;
  subscribe(listener: () => void): () => void;
}
