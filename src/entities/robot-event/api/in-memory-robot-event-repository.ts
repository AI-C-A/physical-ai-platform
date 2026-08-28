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
        title: '[OSA-1] 온라인 상태',
        detail: '로봇이 온라인 상태로 전환되었습니다.',
      },
      {
        type: 'warning',
        title: '[ADS-1] 배터리 부족',
        detail: '배터리 잔량이 20%로 임계치 20% 이하입니다.',
      },
      {
        type: 'error',
        title: '[OSA-2] 오프라인 상태',
        detail: '로봇이 오프라인 상태로 전환되었습니다.',
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
