/** 현재 제품이 소비하는 Patrol 필드만 포함하며 GPS 미수신 좌표는 null로 정규화한다. */
export interface PatrolRobotSnapshot {
  readonly id: number;
  readonly serialNumber: string | null;
  readonly name: string | null;
  readonly nickname: string | null;
  readonly battery: number;
  readonly isConnecting: boolean;
  readonly isCharging: boolean;
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

export type RobotOperationalStatusSubscriptionEvent =
  | {
      readonly kind: 'updated';
      readonly robotId: string;
    }
  | {
      readonly kind: 'stale';
      readonly lastSuccessfulAtMs: number | null;
      readonly message: string;
      readonly robotId: string;
    };

export interface RobotOperationalStatusQueryPort {
  listOperationalDataSources(
    robotId: string,
  ): Promise<readonly RobotOperationalDataSource[]>;
  getOperationalStatus(robotId: string): Promise<RobotOperationalStatus | null>;
  /** 외부 상태 stream이 바뀔 때 query를 무효화한다. 미지원 Adapter는 생략할 수 있다. */
  subscribeOperationalStatuses?(
    robotIds: readonly string[],
    listener: (event: RobotOperationalStatusSubscriptionEvent) => void,
  ): () => void;
}
