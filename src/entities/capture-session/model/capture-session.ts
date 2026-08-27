import type {
  ControlMode,
  DataOrigin,
  DeliveryMode,
  ExecutionEnvironment,
  ExecutionProvenance,
} from '@/shared/domain';

export type CaptureSessionStatus =
  | 'draft'
  | 'validating'
  | 'ready'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'finalizing'
  | 'processing'
  | 'completed'
  | 'interrupted'
  | 'failed';

export type { ExecutionProvenance } from '@/shared/domain';

export interface CaptureRequestedStream {
  readonly id: string;
  readonly displayName: string;
  readonly expectedRateHz: number | null;
}

export interface CapturePlanOptions {
  readonly streams: readonly CaptureRequestedStream[];
  readonly environments: readonly ExecutionEnvironment[];
  readonly deliveryModes: readonly DeliveryMode[];
  readonly dataOrigins: readonly DataOrigin[];
  readonly controlModes: readonly ControlMode[];
}

export interface CaptureStreamStatus extends CaptureRequestedStream {
  readonly state: 'waiting' | 'active' | 'stopped' | 'stale';
  readonly observedRateHz: number | null;
  readonly bytesWritten: number;
  /** Edge Collector가 마지막으로 수신했다고 보고한 Unix epoch millisecond다. */
  readonly lastReceivedTimestampMs: number | null;
}

export interface CreateCaptureSessionInput {
  readonly name: string;
  readonly robotId: string;
  readonly sensorDeviceId: string;
  readonly integrationProfileId: string;
  readonly provenance: ExecutionProvenance;
  readonly streams: readonly CaptureRequestedStream[];
}

/** Capture 실행의 조회·제어 상태를 나타내며 원본 미디어 데이터는 포함하지 않는다. */
export interface CaptureSession {
  readonly id: string;
  readonly name: string;
  readonly robotId: string;
  readonly sensorDeviceId: string;
  readonly integrationProfileId: string;
  readonly provenance: ExecutionProvenance;
  readonly status: CaptureSessionStatus;
  readonly createdAtMs: number;
  readonly startedAtMs: number | null;
  readonly stoppedAtMs: number | null;
  readonly completedAtMs: number | null;
  readonly bytesWritten: number;
  readonly streams: readonly CaptureStreamStatus[];
  readonly episodeId: string | null;
  readonly lastError: string | null;
  readonly preflight: CaptureValidationResult | null;
  readonly statusHistory: readonly CaptureStatusHistoryItem[];
}

export interface CaptureStatusHistoryItem {
  readonly status: CaptureSessionStatus;
  /** 상태가 시작된 Unix epoch millisecond다. */
  readonly occurredAtMs: number;
}

export interface CapturePreflightCheck {
  readonly id: string;
  readonly label: string;
  readonly state: 'passed' | 'failed';
  readonly detail: string;
}

export interface CaptureValidationResult {
  readonly passed: boolean;
  readonly checks: readonly CapturePreflightCheck[];
}

export interface CaptureSessionEvent {
  readonly session: CaptureSession;
  readonly occurredAtMs: number;
}
