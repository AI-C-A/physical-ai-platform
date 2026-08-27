import { describe, expect, it, vi } from 'vitest';

import type { ClockPort } from '@/shared/lib/clock';

import { createInMemoryRobotEventRepository } from './in-memory-robot-event-repository';

const anchorMs = 1_800_000_000_000;
const clock: ClockPort = { nowMs: () => anchorMs };

describe('createInMemoryRobotEventRepository', () => {
  it('유형·로봇·기간 필터와 페이지를 동일한 최신순 집합에 적용한다', async () => {
    const repository = createInMemoryRobotEventRepository(clock);

    const result = await repository.queryEvents({
      type: 'error',
      robotId: 'robot-003',
      startMs: anchorMs - 40 * 60 * 1000,
      page: 1,
      pageSize: 1,
    });

    expect(result).toMatchObject({ totalItems: 1, totalPages: 1, page: 1 });
    expect(result.items[0]).toMatchObject({
      id: 'event-003',
      robotId: 'robot-003',
      type: 'error',
      occurredAtMs: anchorMs - 36 * 60 * 1000,
    });
  });

  it('읽기 전용 저장소 구독은 데이터 변경이 없으면 호출되지 않는다', async () => {
    const repository = createInMemoryRobotEventRepository(clock);
    const listener = vi.fn();
    const unsubscribe = repository.subscribe(listener);

    await repository.listEvents();
    await repository.queryEvents({
      type: null,
      robotId: null,
      startMs: null,
      page: 1,
      pageSize: 20,
    });
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });
});
