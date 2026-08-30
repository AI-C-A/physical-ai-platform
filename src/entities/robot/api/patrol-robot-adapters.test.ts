import { describe, expect, it, vi } from 'vitest';

import {
  PatrolRobotCatalogAdapter,
  PatrolRobotOperationalStatusQuery,
} from './patrol-robot-adapters';
import { PatrolApiStatusCheckError } from '../model/patrol-api-status';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

const endpoint = '/api/integrations/patrol';

describe('PatrolRobotCatalogAdapter', () => {
  it('게이트웨이 등록 목록만 최소 내부 Robot DTO로 변환한다', async () => {
    const fetcher = vi.fn<(
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>>(() => Promise.resolve(jsonResponse({
      items: [{
        id: 'robot-01',
        serialNumber: 'MOCK00001',
        name: '405',
        displayName: '405',
        description: null,
        integrationProfileId: 'patrol-rest-v1',
        isAvailable: true,
        isMovable: true,
      }],
    })));
    const adapter = new PatrolRobotCatalogAdapter({ endpoint, fetcher });

    await expect(adapter.listRobots()).resolves.toEqual([{
      id: 'robot-01',
      serialNumber: 'MOCK00001',
      name: '405',
      displayName: '405',
      integrationProfileId: 'patrol-rest-v1',
    }]);
    const [input, init] = fetcher.mock.calls[0] ?? [];
    expect(input).toBeInstanceOf(URL);
    if (!(input instanceof URL)) throw new Error('Robot 목록 요청 URL이 필요합니다.');
    expect(input.pathname).toMatch(/\/api\/integrations\/patrol\/robots$/);
    expect(init).not.toHaveProperty('credentials');
    expect(JSON.stringify(init)).not.toMatch(/apiKey|secret|awsKey/i);
  });

  it.each([
    { items: 'not-array' },
    { items: [{ id: 'same', serialNumber: 'A', displayName: '첫째', description: null, integrationProfileId: 'p' }, { id: 'same', serialNumber: 'B', displayName: '둘째', description: null, integrationProfileId: 'p' }] },
    { items: [{ id: 'robot-1', serialNumber: 'A', displayName: '', description: null, integrationProfileId: 'p' }] },
  ])('잘못된 외부 목록 Shape %o를 사용자용 문구로 정규화한다', async (payload) => {
    const adapter = new PatrolRobotCatalogAdapter({
      endpoint,
      fetcher: () => Promise.resolve(jsonResponse(payload)),
    });

    await expect(adapter.listRobots()).rejects.toThrow('로봇 목록을 불러오지 못했습니다.');
    await expect(adapter.listRobots()).rejects.not.toThrow(/items|displayName|중복/u);
  });

  it('다른 origin의 gateway endpoint를 거절한다', () => {
    expect(() => new PatrolRobotCatalogAdapter({
      endpoint: 'https://example.com/api/integrations/patrol',
    })).toThrow('같은 origin');
  });

  it('게이트웨이 목록의 null serialNumber를 그대로 보존한다', async () => {
    const adapter = new PatrolRobotCatalogAdapter({
      endpoint,
      fetcher: () => Promise.resolve(jsonResponse({
        items: [{
          id: 'robot-01',
          serialNumber: null,
          name: '405',
          displayName: '405',
          description: null,
          integrationProfileId: 'patrol-rest-v1',
        }],
      })),
    });

    await expect(adapter.listRobots()).resolves.toMatchObject([
      { serialNumber: null },
    ]);
  });

  it('상태 확인도 실제 로봇 목록 응답을 끝까지 검증한다', async () => {
    const fetcher = vi.fn<(
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>>(() => Promise.resolve(jsonResponse({
        items: [{
          id: 'robot-01',
          serialNumber: 'MOCK00001',
          name: '405',
          displayName: '405',
          integrationProfileId: 'patrol-rest-v1',
        }],
      })));
    const adapter = new PatrolRobotCatalogAdapter({ endpoint, fetcher });

    const controller = new AbortController();
    await expect(adapter.check(controller.signal)).resolves.toBeUndefined();
    expect(adapter.endpoint).toBe(endpoint);
    const [input, init] = fetcher.mock.calls[0] ?? [];
    expect(input).toBeInstanceOf(URL);
    expect(init?.signal).toBe(controller.signal);
  });

  it.each([
    {
      label: 'HTTP 오류',
      fetcher: () => Promise.resolve(jsonResponse({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Patrol 서비스를 사용할 수 없습니다.',
      }, 503)),
    },
    {
      label: '잘못된 JSON',
      fetcher: () => Promise.resolve(new Response('not-json', { status: 200 })),
    },
    {
      label: '네트워크 오류',
      fetcher: () => Promise.reject(new Error('private network detail')),
    },
    {
      label: '잘못된 응답 구조',
      fetcher: () => Promise.resolve(jsonResponse({ items: 'not-array' })),
    },
  ])('$label이면 공개된 unavailable 원인으로 정규화한다', async ({ fetcher }) => {
    const adapter = new PatrolRobotCatalogAdapter({ endpoint, fetcher });

    await expect(adapter.check()).rejects.toMatchObject({
      reason: 'unavailable',
    });
  });

  it('게이트웨이 timeout code를 공개된 timeout 원인으로 정규화한다', async () => {
    const adapter = new PatrolRobotCatalogAdapter({
      endpoint,
      fetcher: () => Promise.resolve(jsonResponse({
        code: 'UPSTREAM_TIMEOUT',
        message: 'Patrol API 응답 시간이 초과되었습니다.',
      }, 504)),
    });

    await expect(adapter.check()).rejects.toEqual(
      expect.objectContaining({
        name: PatrolApiStatusCheckError.name,
        reason: 'timeout',
      }),
    );
  });

  it('호출자가 상태 확인을 취소하면 timeout 오류로 바꾸지 않는다', async () => {
    const controller = new AbortController();
    const adapter = new PatrolRobotCatalogAdapter({
      endpoint,
      fetcher: (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      }),
    });

    const check = adapter.check(controller.signal);
    const assertion = expect(check).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();

    await assertion;
  });
});

describe('PatrolRobotOperationalStatusQuery', () => {
  it('운영 상태 REST 응답을 하나의 기록 대상 API source로 노출한다', async () => {
    const fetcher = vi.fn<(
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>>();
    const query = new PatrolRobotOperationalStatusQuery({
      clock: { nowMs: () => 1 },
      endpoint,
      fetcher,
    });

    await expect(query.listOperationalDataSources('robot-01')).resolves.toEqual([{
      id: 'robot-01:operational-status',
      displayName: '로봇 운영 상태 API',
    }]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('battery를 퍼센트로 보존하고 (0, 0)은 GPS 미수신으로 정규화한다', async () => {
    const fetcher = vi.fn<(
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>>(() => Promise.resolve(jsonResponse({
      robotId: 'robot-01',
      integrationProfileId: 'patrol-rest-v1',
      data: {
        id: 246,
        serialNumber: 'MOCK00001',
        name: '405',
        nickname: 'Mock Robot',
        description: null,
        battery: 100,
        isConnecting: true,
        latitude: 0,
        longitude: 0,
        isCharging: false,
        isHeadLightOn: false,
        isCargoOpen: false,
        isAvailable: true,
        isMovable: true,
      },
    })));
    const query = new PatrolRobotOperationalStatusQuery({
      clock: { nowMs: () => 1_700_000_000_123 },
      endpoint,
      fetcher,
    });

    await expect(query.getOperationalStatus('robot-01')).resolves.toEqual({
      robotId: 'robot-01',
      integrationProfileId: 'patrol-rest-v1',
      receivedTimestampMs: 1_700_000_000_123,
      data: {
        id: 246,
        serialNumber: 'MOCK00001',
        name: '405',
        nickname: 'Mock Robot',
        battery: 100,
        isConnecting: true,
        latitude: null,
        longitude: null,
        isCharging: false,
      },
    });
    const [input] = fetcher.mock.calls[0] ?? [];
    expect(input).toBeInstanceOf(URL);
    if (!(input instanceof URL)) throw new Error('Robot 상태 요청 URL이 필요합니다.');
    expect(input.pathname).toMatch(/\/robots\/robot-01\/status$/);
  });

  it('한 축만 0인 유효한 좌표는 그대로 보존한다', async () => {
    const query = new PatrolRobotOperationalStatusQuery({
      clock: { nowMs: () => 1 },
      endpoint,
      fetcher: () => Promise.resolve(jsonResponse({
        robotId: 'robot-01',
        integrationProfileId: 'patrol-rest-v1',
        data: {
          id: 246,
          serialNumber: 'MOCK00001',
          name: '405',
          nickname: 'Mock Robot',
          battery: 100,
          isConnecting: true,
          latitude: 0,
          longitude: 127,
          isCharging: false,
        },
      })),
    });

    await expect(query.getOperationalStatus('robot-01')).resolves.toMatchObject({
      data: { latitude: 0, longitude: 127 },
    });
  });

  it('게이트웨이 상태의 null serialNumber를 그대로 보존한다', async () => {
    const query = new PatrolRobotOperationalStatusQuery({
      clock: { nowMs: () => 1 },
      endpoint,
      fetcher: () => Promise.resolve(jsonResponse({
        robotId: 'robot-01',
        integrationProfileId: 'patrol-rest-v1',
        data: {
          id: 246,
          serialNumber: null,
          name: '405',
          nickname: null,
          description: null,
          battery: 100,
          isConnecting: true,
          latitude: 0,
          longitude: 0,
          isCharging: false,
          isHeadLightOn: false,
          isCargoOpen: false,
        },
      })),
    });

    await expect(query.getOperationalStatus('robot-01')).resolves.toMatchObject({
      data: { serialNumber: null },
    });
  });

  it.each([
    { robotId: 'other', integrationProfileId: 'p', data: {} },
    { robotId: 'robot-01', integrationProfileId: 'p', data: { id: 1, serialNumber: 'A', name: null, nickname: null, description: null, battery: '100', isConnecting: true, latitude: null, longitude: null, isCharging: false, isHeadLightOn: false, isCargoOpen: false } },
    { robotId: 'robot-01', integrationProfileId: 'p', data: { id: 1, serialNumber: 'A', name: null, nickname: null, description: null, battery: 100, isConnecting: 'true', latitude: null, longitude: null, isCharging: false, isHeadLightOn: false, isCargoOpen: false } },
    { robotId: 'robot-01', integrationProfileId: 'p', data: { id: 1, serialNumber: 'A', name: null, nickname: null, description: null, battery: 100, isConnecting: true, latitude: '0', longitude: 0, isCharging: false, isHeadLightOn: false, isCargoOpen: false } },
    { robotId: 'robot-01', integrationProfileId: 'p', data: { id: 1, serialNumber: 'A', name: null, nickname: null, battery: 101, isConnecting: true, latitude: null, longitude: null, isCharging: false } },
    { robotId: 'robot-01', integrationProfileId: 'p', data: { id: 1, serialNumber: 'A', name: null, nickname: null, battery: 100, isConnecting: true, latitude: 91, longitude: 0, isCharging: false } },
    { robotId: 'robot-01', integrationProfileId: 'p', data: { id: 1, serialNumber: 'A', name: null, nickname: null, battery: 100, isConnecting: true, latitude: 0, longitude: 181, isCharging: false } },
  ])('잘못된 운영 상태 Shape를 unknown 입력에서 거절한다', async (payload) => {
    const query = new PatrolRobotOperationalStatusQuery({
      clock: { nowMs: () => 1 },
      endpoint,
      fetcher: () => Promise.resolve(jsonResponse(payload)),
    });

    await expect(query.getOperationalStatus('robot-01')).rejects.toThrow(
      '로봇 정보를 불러오지 못했습니다.',
    );
    await expect(query.getOperationalStatus('robot-01')).rejects.not.toThrow(
      /Robot 운영 상태|data|battery|isConnecting|latitude/u,
    );
  });

  it('정규화된 게이트웨이 오류만 UI에 전달한다', async () => {
    const query = new PatrolRobotOperationalStatusQuery({
      clock: { nowMs: () => 1 },
      endpoint,
      fetcher: () => Promise.resolve(jsonResponse({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Patrol 상태 서비스에 연결하지 못했습니다.',
      }, 503)),
    });

    await expect(query.getOperationalStatus('robot-01')).rejects.toMatchObject({
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Patrol 상태 서비스에 연결하지 못했습니다.',
    });
  });
});
