export {
  InMemoryTelemetryAdapter,
} from './api/in-memory-telemetry';
export { InMemoryRobotGeolocationQuery } from './api/in-memory-robot-geolocation-query';
export {
  RobotGeolocationContext,
  useRobotGeolocationQueryPort,
} from './model/robot-geolocation-context';
export {
  RobotTelemetryContext,
  useRobotTelemetryPort,
} from './model/robot-telemetry-context';
export { useRobotTelemetry } from './model/use-robot-telemetry';
export { useFleetTelemetry } from './model/use-fleet-telemetry';
export {
  useRobotGeolocation,
  type RobotGeolocationLoadState,
} from './model/use-robot-geolocation';
export type {
  RobotBatteryPayload,
  RobotBatteryTelemetryEvent,
  RobotGeolocationObservation,
  RobotPosePayload,
  RobotPoseTelemetryEvent,
  RobotTelemetryEvent,
  TelemetryChannel,
  TelemetryConnectionState,
  TelemetryEnvelope,
} from './model/robot-telemetry';
export { isValidRobotGeolocation } from './model/robot-telemetry';
export type { RobotGeolocationQueryPort } from './model/robot-geolocation-query-port';
export type {
  RobotTelemetryPort,
  TelemetryChannelDescriptor,
  TelemetrySubscription,
} from './model/robot-telemetry-port';
