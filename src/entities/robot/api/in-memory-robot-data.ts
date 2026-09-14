import type { ClockPort } from '@/shared/lib/clock';

import type { RobotDescriptor } from '../model/robot';
import { createInMemoryRobotCatalog } from './in-memory-robot-catalog';
import { InMemoryRobotOperationalStatusQuery } from './in-memory-robot-operational-status';

const definitions = [
  {
    displayName: '사족보행 로봇',
    integrationProfileId: 'quadruped-standard-v1',
    robotType: 'quadruped',
    modelId: 'rbq10',
    company: { name: '현대로템', logoUrl: `${import.meta.env.BASE_URL}assets/companies/hyundai-rotem.svg` },
  },
  {
    displayName: '사륜 로봇',
    integrationProfileId: 'wheeled-standard-v1',
    robotType: 'mobile',
    modelId: 'four-wheel-rover',
    company: { name: '뉴빌리티', logoUrl: `${import.meta.env.BASE_URL}assets/companies/neubility.svg` },
  },
  {
    displayName: '양팔형 로봇',
    integrationProfileId: 'humanoid-standard-v1',
    robotType: 'humanoid',
    modelId: 'openarm',
    company: { name: '육군 인공지능센터', logoUrl: `${import.meta.env.BASE_URL}assets/companies/army-center.webp` },
  },
  {
    displayName: '휴머노이드 로봇',
    integrationProfileId: 'humanoid-standard-v1',
    robotType: 'humanoid',
    modelId: 'alice5',
    company: { name: '에이로봇', logoUrl: `${import.meta.env.BASE_URL}assets/companies/arobot.png` },
  },
  {
    displayName: '차륜형 로봇',
    integrationProfileId: 'wheeled-standard-v1',
    robotType: 'mobile',
    modelId: 'wheeled-robot',
    company: { name: '서울대학교', logoUrl: `${import.meta.env.BASE_URL}assets/companies/snu.png` },
  },
] as const satisfies readonly Omit<RobotDescriptor, 'id' | 'serialNumber' | 'name'>[];

export const inMemoryRobotLocations = {
  // 판교 스타트업캠퍼스 (성남시 분당구 판교로289번길 20).
  'robot-001': { latitude: 37.40462, longitude: 127.10581 },
  'robot-002': { latitude: 37.40468, longitude: 127.10575 },
  'robot-003': { latitude: 37.40474, longitude: 127.10581 },
  'robot-004': { latitude: 37.40468, longitude: 127.10587 },
  'robot-005': { latitude: 37.40474, longitude: 127.10593 },
} as const;

const robots: readonly RobotDescriptor[] = definitions.map((definition, index) => ({
  ...definition,
  id: `robot-${String(index + 1).padStart(3, '0')}`,
  serialNumber: `N${String(index + 1).padStart(7, '0')}`,
  name: definition.displayName,
}));

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
