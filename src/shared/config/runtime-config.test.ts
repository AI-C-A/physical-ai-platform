import { describe, expect, it, vi } from 'vitest';

import { loadRuntimeConfig, parseRuntimeConfig, type BrandingConfig } from './runtime-config';

const defaultBranding: BrandingConfig = { productName: '기본 제품명', shortName: '기본명', logo: null };
const connections = { patrol: { endpoint: null }, telemetry: { endpoint: null, integrationProfileId: null }, video: { endpoint: null }, capture: { endpoint: null } } as const;
const validConfig = { branding: { productName: '사용자 제품명', shortName: '사용자명', logo: '/assets/logo.svg' }, adapters: { mode: 'bundle', implementation: 'in-memory' }, connections } as const;

describe('parseRuntimeConfig', () => {
  it('선택적 다크 로고 경로를 검증하고 사용자 브랜드에 기본 로고를 섞지 않는다', () => {
    const branding = { ...validConfig.branding, logoDark: '/assets/custom-dark.svg' };
    expect(parseRuntimeConfig({ ...validConfig, branding }, defaultBranding).branding).toEqual(branding);
    expect(parseRuntimeConfig(validConfig, { ...defaultBranding, logoDark: '/default-dark.svg' }).branding).toEqual(validConfig.branding);
    expect(() => parseRuntimeConfig({ ...validConfig, branding: { ...branding, logoDark: 123 } }, defaultBranding)).toThrow('branding.logoDark');
  });

  it('수집 구현을 검증하고 알 수 없는 설정을 거부한다', () => {
    expect(parseRuntimeConfig({ ...validConfig, collection: { implementation: 'external' } }, defaultBranding).collection)
      .toEqual({ implementation: 'external' });
    expect(() => parseRuntimeConfig({ ...validConfig, collection: { implementation: 'invalid' } }, defaultBranding)).toThrow();
    expect(() => parseRuntimeConfig({ ...validConfig, collection: { implementation: 'external', token: 'unexpected' } }, defaultBranding)).toThrow();
  });

  it('완전한 in-memory bundle을 파싱한다', () => {
    expect(parseRuntimeConfig(validConfig, defaultBranding)).toEqual(validConfig);
  });

  it('bundle 이외의 Adapter 구성을 거부한다', () => {
    expect(() => parseRuntimeConfig({
      adapters: {
        mode: 'unsupported',
      },
      connections,
    }, defaultBranding)).toThrow('adapters.mode 설정은 bundle이어야 합니다.');
  });

  it('지원하지 않는 Adapter 구현 값을 거부한다', () => {
    expect(() => parseRuntimeConfig({ ...validConfig, adapters: { mode: 'bundle', implementation: 'unsupported' } }, defaultBranding)).toThrow('in-memory 또는 external');
  });

  it('알 수 없는 키를 거부한다', () => {
    expect(() => parseRuntimeConfig({ ...validConfig, accessToken: '저장하면 안 되는 값' }, defaultBranding)).toThrow('runtimeConfig.accessToken');
  });
});

describe('loadRuntimeConfig', () => {
  it('고정 경로를 캐시 없이 읽는다', async () => {
    const fetcher = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(Response.json(validConfig));
    await expect(loadRuntimeConfig(defaultBranding, fetcher)).resolves.toEqual(validConfig);
    const firstCall = fetcher.mock.calls[0];
    expect(firstCall?.[0]).toBe('/runtime-config.json');
    expect(firstCall?.[1]?.cache).toBe('no-store');
    expect(firstCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('전체 설정 읽기가 시작 제한 시간을 넘으면 요청을 중단하고 오류를 반환한다', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((resolve, reject) => {
          void resolve;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('테스트 timeout 중단', 'AbortError'));
          }, { once: true });
        });
      });
      const result = expect(loadRuntimeConfig(
        defaultBranding,
        fetcher,
        { timeoutMs: 25 },
      )).rejects.toThrow(
        '런타임 설정을 기다리는 시간이 초과되었습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
      );

      await vi.advanceTimersByTimeAsync(25);

      await result;
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('timeout 전 AbortError는 시간 초과와 구분해 취소 오류로 반환한다', async () => {
    const fetcher = vi.fn(() => Promise.reject(new DOMException('중단됨', 'AbortError')));

    await expect(loadRuntimeConfig(defaultBranding, fetcher, { timeoutMs: 100 })).rejects.toThrow(
      '런타임 설정 요청이 취소되었습니다. 다시 시도해 주세요.',
    );
  });

  it('성공 후 시작 제한 시간 타이머를 정리한다', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(() => Promise.resolve(Response.json(validConfig)));

      await expect(loadRuntimeConfig(defaultBranding, fetcher)).resolves.toEqual(validConfig);

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('응답 실패를 앱 시작 오류로 변환한다', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(null, { status: 503 })));
    await expect(loadRuntimeConfig(defaultBranding, fetcher)).rejects.toThrow('런타임 설정을 읽지 못했습니다. (HTTP 503)');
  });

  it('네트워크 예외를 한국어 복구 안내로 변환한다', async () => {
    const fetcher = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(loadRuntimeConfig(defaultBranding, fetcher)).rejects.toThrow(
      '런타임 설정을 요청하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    );
  });

  it('잘못된 JSON 응답을 한국어 형식 오류로 변환한다', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response('{')));

    await expect(loadRuntimeConfig(defaultBranding, fetcher)).rejects.toThrow(
      '런타임 설정의 JSON 형식이 올바르지 않습니다.',
    );
  });

  it('알 수 없는 payload를 기존 설정 검증 오류로 거부한다', async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({})));

    await expect(loadRuntimeConfig(defaultBranding, fetcher)).rejects.toThrow(
      'adapters 설정은 객체여야 합니다.',
    );
  });
});
