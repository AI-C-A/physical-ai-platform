/** Patrol robot_status가 제공한 필드를 이름과 값의 변환 없이 보존한다. */
export interface PatrolRobotSnapshot {
  readonly id: number;
  readonly serialNumber: string | null;
  readonly name: string | null;
  readonly nickname: string | null;
  readonly description: string | null;
  readonly battery: number;
  readonly isConnecting: boolean;
  readonly isAvailable: boolean | null;
  readonly isCharging: boolean;
  readonly isMovable: boolean;
  readonly isHeadLightOn: boolean;
  readonly isCargoOpen: boolean;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/** 프론트 식별 정보와 수신 메타데이터를 Patrol 원본 데이터와 분리한다. */
export interface RobotOperationalStatus {
  readonly robotId: string;
  readonly integrationProfileId: string;
  readonly receivedTimestampMs: number;
  readonly data: PatrolRobotSnapshot;
}

/** Capture 계획에서 API 응답을 하나의 원자적 논리 stream으로 식별한다. */
export interface RobotOperationalDataSource {
  readonly id: string;
  readonly displayName: string;
}

export interface RobotOperationalStatusQueryPort {
  listOperationalDataSources(
    robotId: string,
  ): Promise<readonly RobotOperationalDataSource[]>;
  getOperationalStatus(robotId: string): Promise<RobotOperationalStatus | null>;
}
