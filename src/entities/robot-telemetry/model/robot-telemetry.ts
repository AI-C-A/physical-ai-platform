export type TelemetryChannel = 'pose' | 'battery';

export type TelemetryConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'reconnecting'
  | 'error';

/** 위치 부재를 null로 표현하는 프로토콜 중립 Telemetry payload다. */
export interface RobotPosePayload {
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/** 배터리 백분율과 연결·충전 상태만 전달하는 프로토콜 중립 Telemetry payload다. */
export interface RobotBatteryPayload {
  readonly battery: number;
  readonly isConnecting: boolean;
  readonly isCharging: boolean;
}

/**
 * 외부 위치 응답을 Mapper가 검증·변환한 뒤 UI가 소비하는 WGS84 표준 관측값이다.
 * 좌표 기준과 단위를 검증한 응답만 이 모델로 변환한다.
 * source timestamp와 정확도를 알 수 없으면 값을 만들지 않고 null로 유지한다.
 */
export interface RobotGeolocationObservation {
  readonly robotId: string;
  readonly latitudeDegrees: number;
  readonly longitudeDegrees: number;
  readonly horizontalAccuracyMeters: number | null;
  readonly sourceTimestampMs: number | null;
  readonly receivedTimestampMs: number;
}

export function isValidRobotGeolocation(
  value: RobotGeolocationObservation,
): boolean {
  return (
    value.robotId.length > 0 &&
    Number.isFinite(value.latitudeDegrees) &&
    value.latitudeDegrees >= -90 &&
    value.latitudeDegrees <= 90 &&
    Number.isFinite(value.longitudeDegrees) &&
    value.longitudeDegrees >= -180 &&
    value.longitudeDegrees <= 180 &&
    (value.horizontalAccuracyMeters === null ||
      (Number.isFinite(value.horizontalAccuracyMeters) &&
        value.horizontalAccuracyMeters >= 0)) &&
    (value.sourceTimestampMs === null ||
      Number.isFinite(value.sourceTimestampMs)) &&
    Number.isFinite(value.receivedTimestampMs)
  );
}

/**
 * 외부 메시지와 UI 사이에서 사용하는 프로토콜 중립 event interface다.
 * 모든 timestamp는 Unix epoch millisecond이며 source와 browser 수신 시각을 분리한다.
 */
export interface TelemetryEnvelope<
  TChannel extends TelemetryChannel,
  TPayload,
> {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly robotId: string;
  readonly sourceDeviceId: string;
  readonly channel: TChannel;
  readonly sourceTimestampMs: number;
  readonly receivedTimestampMs: number;
  readonly sequence: number;
  readonly frameId: string | null;
  readonly payload: TPayload;
}

export type RobotPoseTelemetryEvent = TelemetryEnvelope<
  'pose',
  RobotPosePayload
>;

export type RobotBatteryTelemetryEvent = TelemetryEnvelope<
  'battery',
  RobotBatteryPayload
>;

export type RobotTelemetryEvent =
  | RobotPoseTelemetryEvent
  | RobotBatteryTelemetryEvent;
