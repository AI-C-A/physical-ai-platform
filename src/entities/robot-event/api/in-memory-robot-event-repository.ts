import type { ClockPort } from '@/shared/lib/clock';
import { createPageResult } from '@/shared/lib/query';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { RobotEvent } from '../model/robot-event';
import type { RobotEventQuery, RobotEventRepositoryPort } from '../model/robot-event-repository';

interface RobotEventState { readonly events: readonly RobotEvent[] }

class InMemoryRobotEventRepository implements RobotEventRepositoryPort {
  readonly #store: StoreApi<RobotEventState>;

  constructor(clock: ClockPort) {
    const anchorMs = clock.nowMs();
    const templates = [
      {
        type: 'info',
        title: '연결 상태 변경',
        detail: '로봇 연결 상태가 변경되었습니다.',
      },
      {
        type: 'warning',
        title: '채널 상태 저하',
        detail: '일부 채널의 수신 품질이 저하되었습니다.',
      },
      {
        type: 'error',
        title: '원본 시각 최신성 저하',
        detail: '원본 시각이 최신 상태가 아닙니다.',
      },
      {
        type: 'warning',
        title: '전송 연결 재시도',
        detail: '전송 연결 복구를 시도하고 있습니다.',
      },
    ] as const satisfies readonly Pick<RobotEvent, 'type' | 'title' | 'detail'>[];
    const events: readonly RobotEvent[] = Array.from({ length: 60 }, (_, index) => {
      const template = templates[index % templates.length] ?? templates[0];
      return {
        id: `event-${String(index + 1).padStart(3, '0')}`,
        robotId: `robot-${String((index % 8) + 1).padStart(3, '0')}`,
        type: template.type,
        occurredAtMs: anchorMs - index * 18 * 60 * 1000,
        title: template.title,
        detail: template.detail,
      };
    });
    this.#store = createStore(() => ({ events }));
  }

  listEvents(): Promise<readonly RobotEvent[]> {
    return Promise.resolve(this.#events());
  }

  queryEvents(query: RobotEventQuery) {
    const filtered = this.#events().filter(
      (event) =>
        (query.type === null || event.type === query.type) &&
        (query.robotId === null || event.robotId === query.robotId) &&
        (query.startMs === null || event.occurredAtMs >= query.startMs),
    );
    const sorted = [...filtered].sort((left, right) => {
      const primary = right.occurredAtMs - left.occurredAtMs;
      return primary === 0 ? left.id.localeCompare(right.id) : primary;
    });
    return Promise.resolve(createPageResult(sorted, query));
  }

  subscribe(listener: () => void): () => void {
    return this.#store.subscribe(listener);
  }

  #events(): readonly RobotEvent[] { return this.#store.getState().events; }
}

export function createInMemoryRobotEventRepository(clock: ClockPort): RobotEventRepositoryPort {
  return new InMemoryRobotEventRepository(clock);
}
