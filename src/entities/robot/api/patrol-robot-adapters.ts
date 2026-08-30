import type { ClockPort } from '@/shared/lib/clock';
import { requestJson, resolveSameOriginEndpoint } from '@/shared/lib/http-json';
import { createPageResult } from '@/shared/lib/query';

import type { RobotCatalogPort, RobotQuery } from '../model/robot-catalog';
import type {
  PatrolRobotSnapshot,
  RobotOperationalStatus,
  RobotOperationalStatusQueryPort,
  RobotOperationalStatusSubscriptionEvent,
} from '../model/robot-operational-status';
import type { RobotDescriptor } from '../model/robot';

type ExternalFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface PatrolAdapterOptions {
  readonly clock: ClockPort;
  readonly endpoint: string;
  readonly eventSourceFactory?: (url: URL) => StatusEventSource;
  readonly fetcher?: ExternalFetcher;
}

interface StatusEventSource {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  close(): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

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

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${fieldName} 값은 boolean이어야 합니다.`);
  return value;
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} 값은 유한한 숫자여야 합니다.`);
  }
  return value;
}

function requireNumberInRange(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
): number {
  const number = requireFiniteNumber(value, fieldName);
  if (number < minimum || number > maximum) {
    throw new Error(`${fieldName} 값은 ${String(minimum)} 이상 ${String(maximum)} 이하여야 합니다.`);
  }
  return number;
}

function optionalFiniteNumber(value: unknown, fieldName: string): number | null {
  return value === null ? null : requireFiniteNumber(value, fieldName);
}

function optionalNumberInRange(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
): number | null {
  return value === null
    ? null
    : requireNumberInRange(value, fieldName, minimum, maximum);
}

function optionalString(value: unknown, fieldName: string): string | null {
  return value === null ? null : requireString(value, fieldName);
}

function createEndpoint(base: URL, path: string): URL {
  const normalizedBase = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  return new URL(`${normalizedBase}${path}`, base.origin);
}

function invalidResponse(message: string, cause: unknown): Error {
  return new Error(message, { cause });
}

function parseRobotList(value: unknown): readonly RobotDescriptor[] {
  const record = requireRecord(value, 'Robot 목록');
  if (!Array.isArray(record.items)) throw new Error('Robot 목록.items는 배열이어야 합니다.');
  const ids = new Set<string>();
  return record.items.map((item, index) => {
    const robot = requireRecord(item, `Robot 목록.items[${String(index)}]`);
    const id = requireString(robot.id, `Robot 목록.items[${String(index)}].id`);
    if (ids.has(id)) throw new Error('Robot 목록에 중복 ID가 있습니다.');
    ids.add(id);
    return {
      id,
      serialNumber: optionalString(
        robot.serialNumber,
        `Robot 목록.items[${String(index)}].serialNumber`,
      ),
      name: optionalString(
        robot.name,
        `Robot 목록.items[${String(index)}].name`,
      ),
      displayName: requireString(
        robot.displayName,
        `Robot 목록.items[${String(index)}].displayName`,
      ),
      integrationProfileId: requireString(
        robot.integrationProfileId,
        `Robot 목록.items[${String(index)}].integrationProfileId`,
      ),
    } satisfies RobotDescriptor;
  });
}

function parseOperationalStatus(
  value: unknown,
  requestedRobotId: string,
  receivedTimestampMs: number,
): RobotOperationalStatus {
  const record = requireRecord(value, 'Robot 운영 상태');
  const robotId = requireString(record.robotId, 'Robot 운영 상태.robotId');
  if (robotId !== requestedRobotId) {
    throw new Error('Robot 운영 상태의 식별자가 요청과 일치하지 않습니다.');
  }
  const data = requireRecord(record.data, 'Robot 운영 상태.data');
  const latitude = optionalNumberInRange(
    data.latitude,
    'Robot 운영 상태.data.latitude',
    -90,
    90,
  );
  const longitude = optionalNumberInRange(
    data.longitude,
    'Robot 운영 상태.data.longitude',
    -180,
    180,
  );
  const hasNoGpsSignal = latitude === 0 && longitude === 0;
  return {
    robotId,
    integrationProfileId: requireString(
      record.integrationProfileId,
      'Robot 운영 상태.integrationProfileId',
    ),
    receivedTimestampMs,
    data: {
      id: requireFiniteNumber(data.id, 'Robot 운영 상태.data.id'),
      serialNumber: optionalString(data.serialNumber, 'Robot 운영 상태.data.serialNumber'),
      name: optionalString(data.name, 'Robot 운영 상태.data.name'),
      nickname: optionalString(data.nickname, 'Robot 운영 상태.data.nickname'),
      battery: requireNumberInRange(
        data.battery,
        'Robot 운영 상태.data.battery',
        0,
        100,
      ),
      isConnecting: requireBoolean(data.isConnecting, 'Robot 운영 상태.data.isConnecting'),
      latitude: hasNoGpsSignal ? null : latitude,
      longitude: hasNoGpsSignal ? null : longitude,
      isCharging: requireBoolean(data.isCharging, 'Robot 운영 상태.data.isCharging'),
    } satisfies PatrolRobotSnapshot,
  };
}

function filterAndSortRobots(
  robots: readonly RobotDescriptor[],
  query: RobotQuery,
): readonly RobotDescriptor[] {
  const search = query.search.trim().toLocaleLowerCase();
  return robots.filter((robot) => (
    (robot.displayName.toLocaleLowerCase().includes(search)
      || robot.id.toLocaleLowerCase().includes(search))
  )).sort((left, right) => {
    const primary = query.sort === 'name-desc'
      ? right.displayName.localeCompare(left.displayName, 'ko')
      : left.displayName.localeCompare(right.displayName, 'ko');
    return primary === 0 ? left.id.localeCompare(right.id) : primary;
  });
}

/** Same-origin gateway 응답을 검증한 뒤 UI가 사용하는 RobotDescriptor로 변환한다. */
export class PatrolRobotCatalogAdapter implements RobotCatalogPort {
  readonly #base: URL;
  readonly #fetcher: ExternalFetcher | undefined;

  constructor(options: Pick<PatrolAdapterOptions, 'endpoint' | 'fetcher'>) {
    this.#base = resolveSameOriginEndpoint(options.endpoint);
    this.#fetcher = options.fetcher;
  }

  async listRobots(): Promise<readonly RobotDescriptor[]> {
    const value = await requestJson(
      createEndpoint(this.#base, 'robots'),
      {},
      this.#fetcher,
    );
    try {
      return parseRobotList(value);
    } catch (error: unknown) {
      throw invalidResponse('로봇 목록을 불러오지 못했습니다.', error);
    }
  }

  async queryRobots(query: RobotQuery) {
    return createPageResult(filterAndSortRobots(await this.listRobots(), query), query);
  }

  async getRobot(robotId: string): Promise<RobotDescriptor | null> {
    return (await this.listRobots()).find((robot) => robot.id === robotId) ?? null;
  }
}

/** 배터리·좌표 범위와 GPS 미수신 표시값을 검증하고 ClockPort 수신 시각을 부여한다. */
export class PatrolRobotOperationalStatusQuery
implements RobotOperationalStatusQueryPort {
  readonly #base: URL;
  readonly #clock: ClockPort;
  readonly #eventSourceFactory: (url: URL) => StatusEventSource;
  readonly #fetcher: ExternalFetcher | undefined;
  readonly #streamedStatuses = new Map<string, RobotOperationalStatus>();
  readonly #streamSubscriberCounts = new Map<string, number>();

  constructor(options: PatrolAdapterOptions) {
    this.#base = resolveSameOriginEndpoint(options.endpoint);
    this.#clock = options.clock;
    this.#eventSourceFactory = options.eventSourceFactory
      ?? ((url) => new EventSource(url));
    this.#fetcher = options.fetcher;
  }

  listOperationalDataSources(
    robotId: string,
  ): Promise<readonly { id: string; displayName: string }[]> {
    return Promise.resolve([{
      id: `${encodeURIComponent(robotId)}:operational-status`,
      displayName: '로봇 운영 상태 API',
    }]);
  }

  async getOperationalStatus(robotId: string): Promise<RobotOperationalStatus> {
    const streamed = this.#streamedStatuses.get(robotId);
    if (streamed !== undefined) return streamed;
    const value = await requestJson(
      createEndpoint(this.#base, `robots/${encodeURIComponent(robotId)}/status`),
      {},
      this.#fetcher,
    );
    try {
      return parseOperationalStatus(value, robotId, this.#clock.nowMs());
    } catch (error: unknown) {
      throw invalidResponse('로봇 정보를 불러오지 못했습니다.', error);
    }
  }

  subscribeOperationalStatuses(
    robotIds: readonly string[],
    listener: (event: RobotOperationalStatusSubscriptionEvent) => void,
  ): () => void {
    const normalizedIds = [...new Set(robotIds)].sort();
    if (normalizedIds.length === 0) return () => undefined;
    const allowedIds = new Set(normalizedIds);
    const url = createEndpoint(this.#base, 'robot-status/events');
    for (const robotId of normalizedIds) url.searchParams.append('robotId', robotId);
    const source = this.#eventSourceFactory(url);
    let active = true;
    let cleanedUp = false;
    for (const robotId of normalizedIds) {
      this.#streamSubscriberCounts.set(robotId, (this.#streamSubscriberCounts.get(robotId) ?? 0) + 1);
    }
    const receiveStatus: EventListener = (event) => {
      if (!active || typeof (event as MessageEvent<unknown>).data !== 'string') return;
      try {
        const value: unknown = JSON.parse((event as MessageEvent<string>).data);
        const record = requireRecord(value, 'Robot 상태 stream');
        const robotId = requireString(record.robotId, 'Robot 상태 stream.robotId');
        if (!allowedIds.has(robotId)) return;
        this.#streamedStatuses.set(
          robotId,
          parseOperationalStatus(value, robotId, this.#clock.nowMs()),
        );
        listener({ kind: 'updated', robotId });
      } catch {
        // 잘못된 한 이벤트는 버리고 현재 연결의 다음 유효 snapshot을 기다린다.
      }
    };
    const receiveStatusError: EventListener = (event) => {
      if (!active || typeof (event as MessageEvent<unknown>).data !== 'string') return;
      try {
        const value: unknown = JSON.parse((event as MessageEvent<string>).data);
        const record = requireRecord(value, 'Robot 상태 stream 오류');
        const robotId = requireString(record.robotId, 'Robot 상태 stream 오류.robotId');
        if (!allowedIds.has(robotId)) return;
        this.#streamedStatuses.delete(robotId);
        listener({
          kind: 'stale',
          lastSuccessfulAtMs: optionalFiniteNumber(
            record.lastSuccessfulAtMs,
            'Robot 상태 stream 오류.lastSuccessfulAtMs',
          ),
          message: requireString(record.message, 'Robot 상태 stream 오류.message'),
          reason: 'status-unavailable',
          robotId,
        });
      } catch {
        // 검증하지 못한 오류 payload는 사용자 상태로 전달하지 않는다.
      }
    };
    const receiveConnectionError: EventListener = () => {
      if (!active) return;
      active = false;
      source.close();
      for (const robotId of normalizedIds) {
        this.#streamedStatuses.delete(robotId);
        listener({
          kind: 'stale',
          lastSuccessfulAtMs: null,
          message: '게이트웨이 연결이 끊겼습니다.',
          reason: 'gateway-unreachable',
          robotId,
        });
      }
    };
    source.addEventListener('status-snapshot', receiveStatus);
    source.addEventListener('status-update', receiveStatus);
    source.addEventListener('status-error', receiveStatusError);
    source.addEventListener('error', receiveConnectionError);

    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      active = false;
      source.removeEventListener('status-snapshot', receiveStatus);
      source.removeEventListener('status-update', receiveStatus);
      source.removeEventListener('status-error', receiveStatusError);
      source.removeEventListener('error', receiveConnectionError);
      source.close();
      for (const robotId of normalizedIds) {
        const count = this.#streamSubscriberCounts.get(robotId) ?? 0;
        if (count <= 1) {
          this.#streamSubscriberCounts.delete(robotId);
          this.#streamedStatuses.delete(robotId);
        } else {
          this.#streamSubscriberCounts.set(robotId, count - 1);
        }
      }
    };
  }
}
