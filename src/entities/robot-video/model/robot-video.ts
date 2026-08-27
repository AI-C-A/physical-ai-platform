export type VideoConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface RobotVideoSource {
  readonly id: string;
  readonly robotId: string;
  readonly displayName: string;
}

export interface RobotVideoSession {
  readonly mediaStream: MediaStream;
  subscribeStatus(listener: (status: VideoConnectionStatus) => void): () => void;
  close(): void;
}

export interface RobotVideoRecordingRequest {
  readonly robotId: string;
  /** Port가 제공하는 논리적 카메라 source 식별자다. 물리 입력 구성은 포함하지 않는다. */
  readonly sourceIds: readonly string[];
}

export interface RobotVideoRecordingCrop {
  readonly sourceId: string;
  readonly displayName: string;
  /** 원본 프레임에 대한 0..1 정규화 좌표다. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RobotVideoRecordingManifest {
  readonly schemaVersion: 1;
  readonly robotId: string;
  readonly startedAtMs: number;
  readonly stoppedAtMs: number;
  readonly requestedSourceIds: readonly string[];
  /** 개별 카메라 추출에 필요한 원본 프레임 좌표다. 개별 입력이면 전체 프레임 좌표다. */
  readonly crops: readonly RobotVideoRecordingCrop[];
  readonly mediaFiles: readonly {
    readonly fileName: string;
    readonly mimeType: string;
  }[];
}

export interface RobotVideoRecordingArtifact {
  readonly blob: Blob;
  readonly fileName: string;
  readonly mimeType: string;
}

export interface RobotVideoRecordingResult {
  readonly artifacts: readonly RobotVideoRecordingArtifact[];
  readonly manifest: RobotVideoRecordingManifest;
  readonly manifestFileName: string;
}

export interface RobotVideoRecordingSession {
  /** 녹화를 마감하고 다운로드 가능한 원본과 분할 메타데이터를 반환한다. */
  stop(): Promise<RobotVideoRecordingResult>;
  /** 결과를 만들지 않고 녹화 자원을 정리한다. */
  cancel(): void;
}

export interface RobotVideoRecordingCapability {
  startRecording(
    request: RobotVideoRecordingRequest,
    signal?: AbortSignal,
  ): Promise<RobotVideoRecordingSession>;
}

export interface RobotVideoPort {
  /** 입력 토폴로지와 무관하게 논리적 카메라 녹화를 제공하는 선택 capability다. */
  readonly recording?: RobotVideoRecordingCapability;
  listSources(robotId: string): Promise<readonly RobotVideoSource[]>;
  openSource(sourceId: string, signal?: AbortSignal): Promise<RobotVideoSession>;
}
