import type { RobotGeolocationQueryPort } from '../model/robot-geolocation-query-port';
import type { RobotGeolocationObservation } from '../model/robot-telemetry';
import type { ClockPort } from '@/shared/lib/clock';

interface RobotLocation {
  readonly latitude: number;
  readonly longitude: number;
}

export class InMemoryRobotGeolocationQuery
  implements RobotGeolocationQueryPort
{
  private readonly clock: ClockPort;
  private readonly locations: Readonly<Record<string, RobotLocation>>;

  constructor(
    clock: ClockPort,
    locations: Readonly<Record<string, RobotLocation>>,
  ) {
    this.clock = clock;
    this.locations = locations;
  }

  getGeolocationObservation(
    robotId: string,
  ): Promise<RobotGeolocationObservation | null> {
    const location = this.locations[robotId];
    return Promise.resolve(
      location === undefined
        ? null
        : {
            robotId,
            latitudeDegrees: location.latitude,
            longitudeDegrees: location.longitude,
            horizontalAccuracyMeters: null,
            sourceTimestampMs: null,
            receivedTimestampMs: this.clock.nowMs(),
          },
    );
  }
}
