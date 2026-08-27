import { describe, expect, it } from 'vitest';

import type { RobotDescriptor } from '../model/robot';
import { createInMemoryRobotCatalog } from './in-memory-robot-catalog';

const robots: readonly RobotDescriptor[] = [
  {
    id: 'robot-027',
    serialNumber: 'SERIAL027',
    displayName: '시설 점검 로봇',
    description: null,
    integrationProfileId: 'profile-test',
  },
  {
    id: 'robot-103',
    serialNumber: 'SERIAL103',
    displayName: '자재 운반 로봇',
    description: null,
    integrationProfileId: 'profile-test',
  },
  {
    id: 'robot-005',
    serialNumber: 'SERIAL005',
    displayName: '시설 점검 로봇',
    description: null,
    integrationProfileId: 'profile-alpha',
  },
];

describe('createInMemoryRobotCatalog', () => {
  it('이름뿐 아니라 로봇 ID로도 대소문자와 양끝 공백을 무시해 검색한다', async () => {
    const catalog = createInMemoryRobotCatalog(robots);

    const result = await catalog.queryRobots({
      page: 1,
      pageSize: 20,
      search: '  ROBOT-103  ',
      sort: 'name-asc',
    });

    expect(result.items.map((robot) => robot.id)).toEqual(['robot-103']);
    expect(result.totalItems).toBe(1);
  });

  it('검색·정렬·페이지를 같은 결과 집합에 적용하고 동률은 ID로 고정한다', async () => {
    const catalog = createInMemoryRobotCatalog(robots);

    const firstPage = await catalog.queryRobots({
      page: 1,
      pageSize: 1,
      search: '시설 점검',
      sort: 'name-asc',
    });
    const secondPage = await catalog.queryRobots({
      page: 2,
      pageSize: 1,
      search: '시설 점검',
      sort: 'name-asc',
    });

    expect(firstPage).toMatchObject({
      totalItems: 2,
      totalPages: 2,
      page: 1,
    });
    expect(firstPage.items.map((robot) => robot.id)).toEqual(['robot-005']);
    expect(secondPage.items.map((robot) => robot.id)).toEqual(['robot-027']);
  });
});
