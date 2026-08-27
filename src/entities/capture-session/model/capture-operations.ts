import type { PageRequest, PageResult } from '@/shared/lib/query';

import type {
  CapturePlanOptions,
  CaptureSession,
  CaptureSessionEvent,
  CaptureValidationResult,
  CreateCaptureSessionInput,
} from './capture-session';

export interface CaptureSessionQuery extends PageRequest {
  readonly search: string;
  readonly status: CaptureSession['status'] | null;
  readonly robotId: string | null;
  readonly environment: CaptureSession['provenance']['environment'] | null;
  readonly deliveryMode: CaptureSession['provenance']['deliveryMode'] | null;
  readonly startMs: number | null;
  readonly sort: 'newest' | 'oldest' | 'name-asc' | 'bytes-desc';
}

export interface CaptureOperationsPort {
  listSessions(): Promise<readonly CaptureSession[]>;
  querySessions(query: CaptureSessionQuery): Promise<PageResult<CaptureSession>>;
  getSession(sessionId: string): Promise<CaptureSession | null>;
  getPlanOptions(robotId: string, sensorDeviceId: string): Promise<CapturePlanOptions>;
  createSession(input: CreateCaptureSessionInput): Promise<CaptureSession>;
  validateSession(sessionId: string): Promise<CaptureValidationResult>;
  startSession(sessionId: string): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  subscribeSession(
    sessionId: string,
    listener: (event: CaptureSessionEvent) => void,
  ): () => void;
  subscribeSessions(listener: () => void): () => void;
}
