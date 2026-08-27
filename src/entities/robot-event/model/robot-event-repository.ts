import type { RobotEvent } from './robot-event';
import type { PageRequest, PageResult } from '@/shared/lib/query';

export interface RobotEventQuery extends PageRequest {
  readonly type: RobotEvent['type'] | null;
  readonly robotId: string | null;
  readonly startMs: number | null;
}

export interface RobotEventRepositoryPort {
  listEvents(): Promise<readonly RobotEvent[]>;
  /** 같은 조건에서는 발생 시각 내림차순, 같은 시각에서는 ID 오름차순으로 안정 정렬한다. */
  queryEvents(query: RobotEventQuery): Promise<PageResult<RobotEvent>>;
  subscribe(listener: () => void): () => void;
}
