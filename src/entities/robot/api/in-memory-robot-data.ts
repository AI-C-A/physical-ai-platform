import type { ClockPort } from '@/shared/lib/clock';

import type { RobotDescriptor } from '../model/robot';
import { createInMemoryRobotCatalog } from './in-memory-robot-catalog';
import { InMemoryRobotOperationalStatusQuery } from './in-memory-robot-operational-status';

const definitions = [
  ['사족보행 로봇', 'quadruped-standard-v1'],
  ['사륜 로봇', 'wheeled-standard-v1'],
  ['양팔형 로봇', 'humanoid-standard-v1'],
] as const satisfies readonly [string, string][];

export const inMemoryRobotLocations = {
  'robot-001': { latitude: 37.39472, longitude: 127.11153 },
  'robot-002': { latitude: 37.39518, longitude: 127.11214 },
  'robot-003': { latitude: 37.39431, longitude: 127.11242 },
} as const;

const robots: readonly RobotDescriptor[] = definitions.map(
  ([displayName, integrationProfileId], index) => ({
    id: `robot-${String(index + 1).padStart(3, '0')}`,
    serialNumber: `N${String(index + 1).padStart(7, '0')}`,
    name: displayName,
    displayName,
    integrationProfileId,
    ...(integrationProfileId === 'quadruped-standard-v1' ? {
      company: {
        name: '레인보우로보틱스',
        logoUrl: `${import.meta.env.BASE_URL}assets/companies/rainbow-robotics.svg`,
      },
    } : integrationProfileId === 'wheeled-standard-v1' ? {
      company: {
        name: '뉴빌리티',
        logoUrl: `${import.meta.env.BASE_URL}assets/companies/neubility.svg`,
      },
    } : integrationProfileId === 'humanoid-standard-v1' ? {
      company: {
        name: 'ARMY CENTER',
        logoUrl: `${import.meta.env.BASE_URL}assets/companies/army-center.webp`,
      },
    } : {}),
    robotType: integrationProfileId.startsWith('humanoid')
      ? 'humanoid'
      : integrationProfileId.startsWith('quadruped')
        ? 'quadruped'
        : 'mobile',
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
