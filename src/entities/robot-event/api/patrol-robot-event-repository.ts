import { requestJson, resolveSameOriginEndpoint } from '@/shared/lib/http-json';

import type { RobotEvent, RobotEventType } from '../model/robot-event';
import type {
  RobotEventQuery,
  RobotEventRepositoryPort,
} from '../model/robot-event-repository';

type ExternalFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface EventSourceLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  close(): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface PatrolRobotEventRepositoryOptions {
  readonly endpoint: string;
  readonly eventSourceFactory?: (url: URL) => EventSourceLike;
  readonly fetcher?: ExternalFetcher;
}

const eventTypes = new Set<RobotEventType>(['info', 'warning', 'error']);

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} 응답은 객체여야 합니다.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} 값은 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value.trim();
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} 값은 유한한 숫자여야 합니다.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = requireFiniteNumber(value, fieldName);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${fieldName} 값은 양의 정수여야 합니다.`);
  }
  return parsed;
}

function createEndpoint(base: URL, path: string): URL {
  const normalizedBase = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  return new URL(`${normalizedBase}${path}`, base.origin);
}

function parseRobotEvent(value: unknown, fieldName: string): RobotEvent {
  const record = requireRecord(value, fieldName);
  const type = requireString(record.type, `${fieldName}.type`);
  if (!eventTypes.has(type as RobotEventType)) {
    throw new Error(`${fieldName}.type 값은 지원하는 이벤트 유형이어야 합니다.`);
  }
  return {
    id: requireString(record.id, `${fieldName}.id`),
    robotId: requireString(record.robotId, `${fieldName}.robotId`),
    type: type as RobotEventType,
    occurredAtMs: requireFiniteNumber(record.occurredAtMs, `${fieldName}.occurredAtMs`),
    title: requireString(record.title, `${fieldName}.title`),
    detail: requireString(record.detail, `${fieldName}.detail`),
  };
}

function parsePageResult(value: unknown, requestedPageSize: number) {
  const record = requireRecord(value, '이벤트 페이지');
  if (!Array.isArray(record.items)) throw new Error('이벤트 페이지.items는 배열이어야 합니다.');
  const page = requirePositiveInteger(record.page, '이벤트 페이지.page');
  const pageSize = requirePositiveInteger(record.pageSize, '이벤트 페이지.pageSize');
  const totalItems = requireFiniteNumber(record.totalItems, '이벤트 페이지.totalItems');
  const totalPages = requirePositiveInteger(record.totalPages, '이벤트 페이지.totalPages');
  if (
    pageSize !== requestedPageSize
    || !Number.isInteger(totalItems)
    || totalItems < 0
    || totalPages !== Math.max(1, Math.ceil(totalItems / pageSize))
    || page > totalPages
    || record.items.length > pageSize
  ) {
    throw new Error('이벤트 페이지 메타데이터가 올바르지 않습니다.');
  }
  return {
    items: record.items.map((item, index) => (
      parseRobotEvent(item, `이벤트 페이지.items[${String(index)}]`)
    )),
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

/** Same-origin Patrol gateway의 이벤트 조회와 변경 알림을 RobotEventRepositoryPort로 변환한다. */
export class PatrolRobotEventRepository implements RobotEventRepositoryPort {
  readonly #base: URL;
  readonly #eventSourceFactory: (url: URL) => EventSourceLike;
  readonly #fetcher: ExternalFetcher | undefined;

  constructor(options: PatrolRobotEventRepositoryOptions) {
    this.#base = resolveSameOriginEndpoint(options.endpoint);
    this.#eventSourceFactory = options.eventSourceFactory ?? ((url) => new EventSource(url));
    this.#fetcher = options.fetcher;
  }

  async listEvents(): Promise<readonly RobotEvent[]> {
    const pageSize = 100;
    const first = await this.queryEvents({
      page: 1,
      pageSize,
      robotId: null,
      startMs: null,
      type: null,
    });
    const events = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const next = await this.queryEvents({
        page,
        pageSize,
        robotId: null,
        startMs: null,
        type: null,
      });
      if (next.totalItems !== first.totalItems || next.totalPages !== first.totalPages) {
        throw new Error('이벤트를 조회하는 동안 결과가 변경되었습니다. 다시 시도하세요.');
      }
      events.push(...next.items);
    }
    return events;
  }

  async queryEvents(query: RobotEventQuery) {
    const url = createEndpoint(this.#base, 'events');
    url.searchParams.set('page', String(query.page));
    url.searchParams.set('pageSize', String(query.pageSize));
    if (query.robotId !== null) url.searchParams.set('robotId', query.robotId);
    if (query.startMs !== null) url.searchParams.set('startMs', String(query.startMs));
    if (query.type !== null) url.searchParams.set('type', query.type);
    const value = await requestJson(url, {}, this.#fetcher);
    try {
      return parsePageResult(value, query.pageSize);
    } catch (error: unknown) {
      throw new Error('이벤트를 불러오지 못했습니다.', { cause: error });
    }
  }

  subscribe(listener: () => void): () => void {
    const source = this.#eventSourceFactory(createEndpoint(this.#base, 'events/stream'));
    let active = true;
    const receiveEvent: EventListener = (event) => {
      if (!active || typeof (event as MessageEvent<unknown>).data !== 'string') return;
      try {
        parseRobotEvent(
          JSON.parse((event as MessageEvent<string>).data) as unknown,
          '이벤트 stream',
        );
        listener();
      } catch {
        // 잘못된 한 stream event는 버리고 다음 유효 이벤트를 기다린다.
      }
    };
    source.addEventListener('event-created', receiveEvent);
    return () => {
      if (!active) return;
      active = false;
      source.removeEventListener('event-created', receiveEvent);
      source.close();
    };
  }
}
