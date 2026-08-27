import { describe, expect, it } from 'vitest';

import {
  createInMemoryRobotCatalogWithData,
  createInMemoryRobotOperationalStatusWithData,
} from './in-memory-robot-data';

describe('InMemoryRobotOperationalStatusQuery', () => {
  it('mock 운영 상태를 같은 mock Robot catalog의 메타데이터와 일치시킨다', async () => {
    const catalog = createInMemoryRobotCatalogWithData();
    const query = createInMemoryRobotOperationalStatusWithData({ nowMs: () => 1234 });
    const [robot] = await catalog.listRobots();
    if (robot === undefined) throw new Error('mock Robot이 필요합니다.');

    await expect(query.getOperationalStatus(robot.id)).resolves.toMatchObject({
      robotId: robot.id,
      integrationProfileId: robot.integrationProfileId,
      receivedTimestampMs: 1234,
      data: {
        serialNumber: robot.serialNumber,
        name: robot.displayName,
        description: robot.description,
        latitude: 37.39472,
        longitude: 127.11153,
      },
    });
  });

  it('mock 운영 상태 API가 기록 source 계약을 제공한다', async () => {
    const query = createInMemoryRobotOperationalStatusWithData({ nowMs: () => 1 });

    await expect(query.listOperationalDataSources('robot-001')).resolves.toEqual([{
      id: 'robot-001:operational-status',
      displayName: '로봇 운영 상태 API',
    }]);
    await expect(query.listOperationalDataSources('unknown')).resolves.toEqual([]);
    await expect(query.getOperationalStatus('unknown')).resolves.toBeNull();
  });
});
