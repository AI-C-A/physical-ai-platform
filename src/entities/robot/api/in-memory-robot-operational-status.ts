import type { ClockPort } from '@/shared/lib/clock';

import type {
  RobotOperationalStatus,
  RobotOperationalStatusQueryPort,
} from '../model/robot-operational-status';
import type { RobotDescriptor } from '../model/robot';

interface RobotLocation {
  readonly latitude: number;
  readonly longitude: number;
}

export class InMemoryRobotOperationalStatusQuery
implements RobotOperationalStatusQueryPort {
  readonly #robots: ReadonlyMap<string, RobotDescriptor>;
  readonly #clock: ClockPort;
  readonly #locations: Readonly<Record<string, RobotLocation>>;

  constructor(
    robots: readonly RobotDescriptor[],
    clock: ClockPort,
    locations: Readonly<Record<string, RobotLocation>> = {},
  ) {
    this.#robots = new Map(robots.map((robot) => [robot.id, robot]));
    this.#clock = clock;
    this.#locations = locations;
  }

  listOperationalDataSources(robotId: string) {
    return Promise.resolve(this.#robots.has(robotId) ? [{
      id: `${encodeURIComponent(robotId)}:operational-status`,
      displayName: '로봇 운영 상태 API',
    }] : []);
  }

  getOperationalStatus(robotId: string): Promise<RobotOperationalStatus | null> {
    const robot = this.#robots.get(robotId);
    if (robot === undefined) return Promise.resolve(null);
    const numericId = Number(robotId.replace(/\D/gu, '')) || 1;
    const location = this.#locations[robotId];
    return Promise.resolve({
      robotId,
      integrationProfileId: robot.integrationProfileId,
      receivedTimestampMs: this.#clock.nowMs(),
      data: {
        id: numericId,
        serialNumber: robot.serialNumber,
        name: robot.displayName,
        nickname: null,
        description: robot.description,
        battery: Math.max(0, 96 - numericId * 4),
        isConnecting: true,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        isAvailable: true,
        isCharging: numericId % 4 === 0,
        isMovable: true,
        isHeadLightOn: numericId % 3 === 0,
        isCargoOpen: false,
      },
    });
  }
}
