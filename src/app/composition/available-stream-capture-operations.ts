import type {
  CaptureOperationsPort,
  CapturePlanOptions,
  CaptureSessionQuery,
  CaptureSessionEvent,
  CaptureValidationResult,
  CreateCaptureSessionInput,
  CaptureSession,
} from '@/entities/capture-session';
import type { RobotOperationalStatusQueryPort } from '@/entities/robot';
import type { RobotTelemetryPort } from '@/entities/robot-telemetry';
import type { RobotVideoPort } from '@/entities/robot-video';
import type { PageResult } from '@/shared/lib/query';

/**
 * 실행 중인 API·Telemetry·Video Adapter가 제공한 stream을 Capture 계획에 투영한다.
 * Capture Adapter의 상태 머신과 저장 의미는 변경하지 않는다.
 */
export class AvailableStreamCaptureOperations implements CaptureOperationsPort {
  readonly #capture: CaptureOperationsPort;
  readonly #operationalStatus: RobotOperationalStatusQueryPort;
  readonly #telemetry: RobotTelemetryPort;
  readonly #video: RobotVideoPort;

  constructor(
    capture: CaptureOperationsPort,
    operationalStatus: RobotOperationalStatusQueryPort,
    telemetry: RobotTelemetryPort,
    video: RobotVideoPort,
  ) {
    this.#capture = capture;
    this.#operationalStatus = operationalStatus;
    this.#telemetry = telemetry;
    this.#video = video;
  }

  listSessions(): Promise<readonly CaptureSession[]> {
    return this.#capture.listSessions();
  }

  querySessions(query: CaptureSessionQuery): Promise<PageResult<CaptureSession>> {
    return this.#capture.querySessions(query);
  }

  getSession(sessionId: string): Promise<CaptureSession | null> {
    return this.#capture.getSession(sessionId);
  }

  async getPlanOptions(
    robotId: string,
    sensorDeviceId: string,
  ): Promise<CapturePlanOptions> {
    const [base, operationalSources, telemetryChannels, videoSources] = await Promise.all([
      this.#capture.getPlanOptions(robotId, sensorDeviceId),
      this.#operationalStatus.listOperationalDataSources(robotId),
      this.#telemetry.getChannelDescriptors(robotId),
      this.#video.listSources(robotId),
    ]);
    const streams = [
      ...operationalSources.map((source) => ({
        ...source,
        expectedRateHz: null,
      })),
      ...telemetryChannels.map((descriptor) => ({
        id: descriptor.channel,
        displayName: descriptor.displayName,
        expectedRateHz: descriptor.expectedRateHz,
      })),
      ...videoSources.map((source) => ({
        id: source.id,
        displayName: source.displayName,
        expectedRateHz: null,
      })),
    ];
    const ids = new Set(streams.map((stream) => stream.id));
    if (ids.size !== streams.length) {
      throw new Error('활성 Adapter가 중복된 기록 대상 stream 식별자를 반환했습니다.');
    }
    return { ...base, streams };
  }

  createSession(input: CreateCaptureSessionInput): Promise<CaptureSession> {
    return this.#capture.createSession(input);
  }

  validateSession(sessionId: string): Promise<CaptureValidationResult> {
    return this.#capture.validateSession(sessionId);
  }

  startSession(sessionId: string): Promise<void> {
    return this.#capture.startSession(sessionId);
  }

  stopSession(sessionId: string): Promise<void> {
    return this.#capture.stopSession(sessionId);
  }

  subscribeSession(
    sessionId: string,
    listener: (event: CaptureSessionEvent) => void,
  ): () => void {
    return this.#capture.subscribeSession(sessionId, listener);
  }

  subscribeSessions(listener: () => void): () => void {
    return this.#capture.subscribeSessions(listener);
  }
}
