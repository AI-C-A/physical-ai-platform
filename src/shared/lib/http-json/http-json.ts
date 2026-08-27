export class HttpJsonError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HttpJsonError';
    this.status = status;
    this.code = code;
  }
}

type JsonFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function readErrorEnvelope(value: unknown): { readonly code: string; readonly message: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { code: 'UNKNOWN', message: '연동 요청을 처리하지 못했습니다.' };
  }
  const record = value as Record<string, unknown>;
  return {
    code: typeof record.code === 'string' && record.code.trim() !== ''
      ? record.code.trim()
      : 'UNKNOWN',
    message: typeof record.message === 'string' && record.message.trim() !== ''
      ? record.message.trim()
      : '연동 요청을 처리하지 못했습니다.',
  };
}

/** 같은 출처 BFF의 JSON만 요청하며 쿠키·비밀 header를 전역으로 추가하지 않는다. */
export async function requestJson(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetcher: JsonFetcher = globalThis.fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(input, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
  } catch (error: unknown) {
    throw new HttpJsonError(
      0,
      'NETWORK_ERROR',
      '연동 게이트웨이에 연결하지 못했습니다.',
      { cause: error },
    );
  }

  let value: unknown;
  try {
    value = await response.json() as unknown;
  } catch (error: unknown) {
    throw new HttpJsonError(
      response.status,
      'INVALID_JSON',
      '연동 게이트웨이 응답 형식이 올바르지 않습니다.',
      { cause: error },
    );
  }
  if (!response.ok) {
    const envelope = readErrorEnvelope(value);
    throw new HttpJsonError(response.status, envelope.code, envelope.message);
  }
  return value;
}

export function resolveSameOriginEndpoint(endpoint: string): URL {
  const base = globalThis.location?.origin;
  if (base === undefined) {
    throw new Error('브라우저 origin을 확인하지 못했습니다.');
  }
  const resolved = new URL(endpoint, base);
  if (resolved.origin !== base || resolved.username !== '' || resolved.password !== '') {
    throw new Error('연동 게이트웨이는 현재 앱과 같은 origin이어야 합니다.');
  }
  resolved.search = '';
  resolved.hash = '';
  return resolved;
}
