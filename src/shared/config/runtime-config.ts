export type AdapterImplementation = 'in-memory' | 'external';

export interface BrandingConfig {
  readonly productName: string;
  readonly shortName: string;
  readonly logo: string | null;
}

export interface AdapterComposition {
  readonly mode: 'bundle';
  readonly implementation: AdapterImplementation;
}

export interface RuntimeConnections {
  readonly patrol: { readonly endpoint: string | null };
  readonly telemetry: {
    readonly endpoint: string | null;
    readonly integrationProfileId: string | null;
  };
  readonly video: { readonly endpoint: string | null };
  readonly capture: { readonly endpoint: string | null };
}

export interface RuntimeConfig {
  readonly branding: BrandingConfig;
  readonly adapters: AdapterComposition;
  readonly connections: RuntimeConnections;
  readonly collection?: { readonly implementation: AdapterImplementation };
}

type RuntimeConfigFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface RuntimeConfigLoadOptions {
  /** 앱 시작 대기 상한이며 개별 API의 timeout으로 재사용하지 않는다. */
  readonly timeoutMs?: number;
}

const runtimeConfigPath = '/runtime-config.json';
const internalRuntimeConfigTimeoutMs = 10_000;

function parseRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} 설정은 객체여야 합니다.`);
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  fieldName: string,
): void {
  const unexpectedKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (unexpectedKey !== undefined) {
    throw new Error(`${fieldName}.${unexpectedKey} 설정은 허용되지 않습니다.`);
  }
}

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} 설정은 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value;
}

function parseNullableString(value: unknown, fieldName: string): string | null {
  return value === null ? null : parseRequiredString(value, fieldName);
}

function parseImplementation(value: unknown, fieldName: string): AdapterImplementation {
  if (value !== 'in-memory' && value !== 'external') {
    throw new Error(`${fieldName} 설정은 in-memory 또는 external이어야 합니다.`);
  }
  return value;
}

function parseBranding(value: unknown, defaults: BrandingConfig): BrandingConfig {
  if (value === undefined) return defaults;
  const record = parseRecord(value, 'branding');
  assertAllowedKeys(record, ['productName', 'shortName', 'logo'], 'branding');
  return {
    productName: parseRequiredString(record.productName, 'branding.productName'),
    shortName: parseRequiredString(record.shortName, 'branding.shortName'),
    logo: parseNullableString(record.logo, 'branding.logo'),
  };
}

function parseAdapters(value: unknown): AdapterComposition {
  const record = parseRecord(value, 'adapters');
  if (record.mode !== 'bundle') {
    throw new Error('adapters.mode 설정은 bundle이어야 합니다.');
  }
  assertAllowedKeys(record, ['mode', 'implementation'], 'adapters');
  return {
    mode: 'bundle',
    implementation: parseImplementation(record.implementation, 'adapters.implementation'),
  };
}

function parseEndpoint(value: unknown, fieldName: string): { readonly endpoint: string | null } {
  const record = parseRecord(value, fieldName);
  assertAllowedKeys(record, ['endpoint'], fieldName);
  return { endpoint: parseNullableString(record.endpoint, `${fieldName}.endpoint`) };
}

function parseConnections(value: unknown): RuntimeConnections {
  const record = parseRecord(value, 'connections');
  assertAllowedKeys(record, ['patrol', 'telemetry', 'video', 'capture'], 'connections');
  const telemetry = parseRecord(record.telemetry, 'connections.telemetry');
  assertAllowedKeys(telemetry, ['endpoint', 'integrationProfileId'], 'connections.telemetry');
  return {
    patrol: parseEndpoint(record.patrol, 'connections.patrol'),
    telemetry: {
      endpoint: parseNullableString(telemetry.endpoint, 'connections.telemetry.endpoint'),
      integrationProfileId: parseNullableString(
        telemetry.integrationProfileId,
        'connections.telemetry.integrationProfileId',
      ),
    },
    video: parseEndpoint(record.video, 'connections.video'),
    capture: parseEndpoint(record.capture, 'connections.capture'),
  };
}

/** 비밀값과 암묵적인 Adapter fallback이 생기지 않도록 Runtime Config를 엄격히 검증한다. */
export function parseRuntimeConfig(
  value: unknown,
  defaultBranding: BrandingConfig,
): RuntimeConfig {
  const record = parseRecord(value, 'runtimeConfig');
  assertAllowedKeys(record, ['branding', 'adapters', 'connections', 'collection'], 'runtimeConfig');
  return {
    branding: parseBranding(record.branding, defaultBranding),
    adapters: parseAdapters(record.adapters),
    connections: parseConnections(record.connections),
    ...(record.collection === undefined ? {} : { collection: parseCollection(record.collection) }),
  };
}

/** 고정 URL을 no-store로 읽고 제한 시간 안에 unknown 응답을 검증해 RuntimeConfig를 반환한다. */
export async function loadRuntimeConfig(
  defaultBranding: BrandingConfig,
  fetcher: RuntimeConfigFetcher = globalThis.fetch,
  options: RuntimeConfigLoadOptions = {},
): Promise<RuntimeConfig> {
  const timeoutMs = options.timeoutMs ?? internalRuntimeConfigTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('런타임 설정의 시작 제한 시간은 0보다 큰 유한한 값이어야 합니다.');
  }
  const controller = new AbortController();
  const timeoutMarker = Symbol('runtime config timeout');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof timeoutMarker>((resolve) => {
    timeoutId = setTimeout(() => resolve(timeoutMarker), timeoutMs);
  });
  const request = async (): Promise<RuntimeConfig> => {
    let response: Response;
    try {
      response = await fetcher(runtimeConfigPath, {
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      throw new Error(
        '런타임 설정을 요청하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new Error(`런타임 설정을 읽지 못했습니다. (HTTP ${String(response.status)})`);
    }

    let value: unknown;
    try {
      value = (await response.json()) as unknown;
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      throw new Error(
        '런타임 설정의 JSON 형식이 올바르지 않습니다.',
        { cause: error },
      );
    }

    return parseRuntimeConfig(value, defaultBranding);
  };

  try {
    const result = await Promise.race([request(), timeout]);
    if (result === timeoutMarker) {
      controller.abort();
      throw new Error(
        '런타임 설정을 기다리는 시간이 초과되었습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
      );
    }
    return result;
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new Error(
        '런타임 설정 요청이 취소되었습니다. 다시 시도해 주세요.',
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

function parseCollection(value: unknown): { readonly implementation: AdapterImplementation } {
  const record = parseRecord(value, 'collection');
  assertAllowedKeys(record, ['implementation'], 'collection');
  return { implementation: parseImplementation(record.implementation, 'collection.implementation') };
}
