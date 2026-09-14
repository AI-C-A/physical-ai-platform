import type { RobotDescriptor } from '@/entities/robot';
import { isValidRobotGeolocation, type RobotGeolocationObservation } from '@/entities/robot-telemetry';

export interface RobotMapLocation {
  readonly label: string;
  readonly company?: RobotDescriptor['company'];
  readonly latitude: number;
  readonly longitude: number;
}

export interface FleetMapLocation extends RobotMapLocation {
  readonly robotId: string;
  readonly needsAttention: boolean;
}

export function getRobotMapLocation(
  robot: RobotDescriptor | undefined,
  geolocation: RobotGeolocationObservation | null,
): RobotMapLocation | null {
  if (
    robot === undefined
    || geolocation === null
    || geolocation.robotId !== robot.id
    || !isValidRobotGeolocation(geolocation)
  ) return null;

  return {
    label: robot.displayName,
    company: robot.company,
    latitude: geolocation.latitudeDegrees,
    longitude: geolocation.longitudeDegrees,
  };
}
