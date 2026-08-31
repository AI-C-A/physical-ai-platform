import { describe, expect, it, vi } from 'vitest';

import type { ClockPort } from '@/shared/lib/clock';

import { createInMemoryInterventionRequests } from './in-memory-intervention-data';
import { InMemoryInterventionQueue } from './in-memory-intervention-queue';

const nowMs = Date.parse('2026-08-30T01:00:00Z');
const clock: ClockPort = { nowMs: () => nowMs };

function createQueue() {
  return new InMemoryInterventionQueue(createInMemoryInterventionRequests(clock));
}

describe('InMemoryInterventionQueue', () => {
  it('즉시 대응 대기·처리 중·우선 확인 순으로 활성 요청을 정렬한다', async () => {
    const queue = createQueue();

    await expect(queue.listActiveRequests()).resolves.toMatchObject([
      { id: 'intervention-002', status: 'waiting', priority: 'critical' },
      { id: 'intervention-001', status: 'accepted', priority: 'high' },
    ]);
  });

  it('허용된 상태 전이마다 구독자에게 알리고 종료 요청을 활성 목록에서 제외한다', async () => {
    const queue = createQueue();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    await expect(queue.accept('intervention-002')).resolves.toMatchObject({
      status: 'accepted',
    });
    await expect(queue.startTeleoperation('intervention-002')).resolves.toMatchObject({
      status: 'teleop',
    });
    await expect(queue.emergencyStop('intervention-002')).resolves.toMatchObject({
      status: 'emergency-stop',
    });
    await expect(queue.resolve('intervention-002')).resolves.toMatchObject({
      status: 'resolved',
    });

    expect(listener).toHaveBeenCalledTimes(4);
    expect((await queue.listActiveRequests()).map(({ id }) => id))
      .not.toContain('intervention-002');
    await expect(queue.getRequest('intervention-002')).resolves.toMatchObject({
      status: 'resolved',
    });

    unsubscribe();
    await queue.transfer('intervention-001');
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('정의되지 않은 상태 전이와 없는 요청을 거절하고 기존 상태를 유지한다', async () => {
    const queue = createQueue();

    await expect(queue.resolve('intervention-002')).rejects.toThrow(
      'waiting → resolved',
    );
    await expect(queue.accept('intervention-001')).rejects.toThrow(
      'accepted → accepted',
    );
    await expect(queue.accept('missing-intervention')).rejects.toThrow(
      '개입 요청을 찾을 수 없습니다',
    );
    await expect(queue.getRequest('intervention-002')).resolves.toMatchObject({
      status: 'waiting',
    });
  });

  it('accepted와 emergency-stop에서 허용된 종료 전이를 제공한다', async () => {
    const transferredQueue = createQueue();
    await expect(transferredQueue.transfer('intervention-001')).resolves.toMatchObject({
      status: 'transferred',
    });

    const stoppedQueue = createQueue();
    await stoppedQueue.emergencyStop('intervention-001');
    await expect(stoppedQueue.transfer('intervention-001')).resolves.toMatchObject({
      status: 'transferred',
    });
  });
});
