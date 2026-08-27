import type { ClockPort } from '@/shared/lib/clock';

import type { RobotDescriptor } from '../model/robot';
import { createInMemoryRobotCatalog } from './in-memory-robot-catalog';
import { InMemoryRobotOperationalStatusQuery } from './in-memory-robot-operational-status';

const definitions = [
  ['정찰 로봇 01', 'quadruped-standard-v1'],
  ['수송 로봇 02', 'wheeled-standard-v1'],
  ['정찰 로봇 03', 'quadruped-standard-v1'],
  ['지원 로봇 04', 'wheeled-standard-v1'],
  ['작업 로봇 05', 'humanoid-standard-v1'],
  ['정찰 로봇 06', 'quadruped-standard-v1'],
  ['수송 로봇 07', 'wheeled-standard-v1'],
  ['지원 로봇 08', 'generic-standard-v1'],
] as const satisfies readonly [string, string][];

export const inMemoryRobotLocations = {
  'robot-001': { latitude: 37.39472, longitude: 127.11153 },
  'robot-002': { latitude: 37.39518, longitude: 127.11214 },
  'robot-003': { latitude: 37.39431, longitude: 127.11242 },
  'robot-004': { latitude: 37.39386, longitude: 127.11172 },
  'robot-005': { latitude: 37.39408, longitude: 127.11091 },
  'robot-006': { latitude: 37.39463, longitude: 127.11039 },
  'robot-007': { latitude: 37.39516, longitude: 127.1107 },
  'robot-008': { latitude: 37.39552, longitude: 127.11142 },
} as const;

const robots: readonly RobotDescriptor[] = definitions.map(
  ([displayName, integrationProfileId], index) => ({
    id: `robot-${String(index + 1).padStart(3, '0')}`,
    serialNumber: `N${String(index + 1).padStart(7, '0')}`,
    displayName,
    description: null,
    integrationProfileId,
  }),
);

export function createInMemoryRobotCatalogWithData() {
  return createInMemoryRobotCatalog(robots);
}

export function createInMemoryRobotOperationalStatusWithData(clock: ClockPort) {
  return new InMemoryRobotOperationalStatusQuery(
    robots,
    clock,
    inMemoryRobotLocations,
  );
}

export const inMemoryRobotIds = robots.map((robot) => robot.id);
