import type { ClockPort } from '@/shared/lib/clock';
import { requestJson, resolveSameOriginEndpoint } from '@/shared/lib/http-json';
import { createPageResult } from '@/shared/lib/query';

import type { RobotCatalogPort, RobotQuery } from '../model/robot-catalog';
import type {
  PatrolRobotSnapshot,
  RobotOperationalStatus,
  RobotOperationalStatusQueryPort,
} from '../model/robot-operational-status';
import type { RobotDescriptor } from '../model/robot';

type ExternalFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface PatrolAdapterOptions {
  readonly clock: ClockPort;
  readonly endpoint: string;
  readonly fetcher?: ExternalFetcher;
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

function optionalBoolean(value: unknown, fieldName: string): boolean | null {
  return value === null ? null : requireBoolean(value, fieldName);
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} 값은 유한한 숫자여야 합니다.`);
  }
  return value;
}

function optionalFiniteNumber(value: unknown, fieldName: string): number | null {
  return value === null ? null : requireFiniteNumber(value, fieldName);
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
      displayName: requireString(
        robot.displayName,
        `Robot 목록.items[${String(index)}].displayName`,
      ),
      description: optionalString(
        robot.description,
        `Robot 목록.items[${String(index)}].description`,
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
      description: optionalString(data.description, 'Robot 운영 상태.data.description'),
      battery: requireFiniteNumber(data.battery, 'Robot 운영 상태.data.battery'),
      isConnecting: requireBoolean(data.isConnecting, 'Robot 운영 상태.data.isConnecting'),
      latitude: optionalFiniteNumber(data.latitude, 'Robot 운영 상태.data.latitude'),
      longitude: optionalFiniteNumber(data.longitude, 'Robot 운영 상태.data.longitude'),
      isAvailable: optionalBoolean(data.isAvailable, 'Robot 운영 상태.data.isAvailable'),
      isCharging: requireBoolean(data.isCharging, 'Robot 운영 상태.data.isCharging'),
      isMovable: requireBoolean(data.isMovable, 'Robot 운영 상태.data.isMovable'),
      isHeadLightOn: requireBoolean(data.isHeadLightOn, 'Robot 운영 상태.data.isHeadLightOn'),
      isCargoOpen: requireBoolean(data.isCargoOpen, 'Robot 운영 상태.data.isCargoOpen'),
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

/** Source payload를 검증하고 Clock이 제공한 수신 시각과 함께 운영 상태로 변환한다. */
export class PatrolRobotOperationalStatusQuery
implements RobotOperationalStatusQueryPort {
  readonly #base: URL;
  readonly #clock: ClockPort;
  readonly #fetcher: ExternalFetcher | undefined;

  constructor(options: PatrolAdapterOptions) {
    this.#base = resolveSameOriginEndpoint(options.endpoint);
    this.#clock = options.clock;
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
}
