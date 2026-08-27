import type { RobotGeolocationObservation } from './robot-telemetry';

/**
 * 내부 Robot ID로 위치 조회 관측값을 요청하는 독립 읽기 Port다.
 * External Adapter는 내부 ID가 제조사 serialNumber와 같다고 가정하지 않고 명시적인 매핑을 사용한다.
 */
export interface RobotGeolocationQueryPort {
  getGeolocationObservation(
    robotId: string,
  ): Promise<RobotGeolocationObservation | null>;
}
