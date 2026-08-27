import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultTimeoutMs = 10_000;

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} 값이 필요합니다.`);
  }
  return value.trim();
}

function parseEndpoint(value, fieldName, expectedProtocol) {
  const rawValue = requireNonEmptyString(value, fieldName);
  let endpoint;
  try {
    endpoint = new URL(rawValue);
  } catch (error) {
    throw new Error(`${fieldName} 값이 유효한 URL이 아닙니다.`, { cause: error });
  }
  if (endpoint.protocol !== expectedProtocol) {
    throw new Error(`${fieldName} 값은 ${expectedProtocol} URL이어야 합니다.`);
  }
  return rawValue;
}

function parseRecord(value, fieldName) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} 응답은 객체여야 합니다.`);
  }
  return value;
}

function parseUpstreamPath(value, fieldName) {
  const path = requireNonEmptyString(value, fieldName);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#')) {
    throw new Error(`${fieldName}은 query와 fragment가 없는 절대 경로여야 합니다.`);
  }
  return path;
}

export function createCameraConfigRequest({
  origin,
  apiKey,
  secret,
  robotSerialNumber,
  cameraConfigPath,
}) {
  const parsedOrigin = new URL(requireNonEmptyString(origin, 'PATROL_ORIGIN'));
  if (parsedOrigin.protocol !== 'https:') {
    throw new Error('PATROL_ORIGIN은 HTTPS 주소여야 합니다.');
  }

  const url = new URL(
    parseUpstreamPath(cameraConfigPath, 'PATROL_CAMERA_CONFIG_PATH'),
    parsedOrigin,
  );
  url.searchParams.set(
    'robotSerialNumber',
    requireNonEmptyString(robotSerialNumber, 'PATROL_ROBOT_SERIAL_NUMBER'),
  );

  return {
    url,
    headers: {
      Accept: 'application/json',
      apiKey: requireNonEmptyString(apiKey, 'PATROL_API_KEY'),
      secret: requireNonEmptyString(secret, 'PATROL_API_SECRET'),
    },
  };
}

export function parseCameraConfig(value) {
  const record = parseRecord(value, '카메라 연결 설정');
  return {
    wssUrl: parseEndpoint(record.wssUrl, 'wssUrl', 'wss:'),
    httpsUrl: parseEndpoint(record.httpsUrl, 'httpsUrl', 'https:'),
    channelArn: requireNonEmptyString(record.channelArn, 'channelArn'),
    awsRegion: requireNonEmptyString(record.awsRegion, 'awsRegion'),
    awsKey: requireNonEmptyString(record.awsKey, 'awsKey'),
    awsSecretKey: requireNonEmptyString(record.awsSecretKey, 'awsSecretKey'),
  };
}

async function readErrorCode(response) {
  try {
    const value = parseRecord(await response.json(), '오류');
    return typeof value.code === 'string' && value.code.trim().length > 0
      ? value.code.trim()
      : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

export async function fetchCameraConfig(input, options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (typeof fetcher !== 'function') {
    throw new Error('이 Node.js 환경은 fetch를 지원하지 않습니다.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('smoke test timeout은 0보다 큰 유한한 값이어야 합니다.');
  }

  const request = createCameraConfigRequest(input);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(request.url, {
      method: 'GET',
      headers: request.headers,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      const code = await readErrorCode(response);
      throw new Error(`카메라 연결 설정 조회가 실패했습니다. HTTP ${response.status}, code=${code}`);
    }
    return parseCameraConfig(await response.json());
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('카메라 연결 설정 조회 시간이 초과되었습니다.', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function summarizeCameraConfig(config) {
  return {
    awsRegion: config.awsRegion,
    wssOrigin: new URL(config.wssUrl).origin,
    httpsOrigin: new URL(config.httpsUrl).origin,
    channelArn: '수신됨(출력하지 않음)',
    awsCredentials: '수신됨(출력하지 않음)',
  };
}

async function main() {
  const config = await fetchCameraConfig({
    origin: process.env.PATROL_ORIGIN,
    apiKey: process.env.PATROL_API_KEY,
    secret: process.env.PATROL_API_SECRET,
    robotSerialNumber: process.env.PATROL_ROBOT_SERIAL_NUMBER,
    cameraConfigPath: process.env.PATROL_CAMERA_CONFIG_PATH,
  });
  console.log('Patrol 카메라 연결 설정 조회에 성공했습니다.');
  console.log(JSON.stringify(summarizeCameraConfig(config), null, 2));
}

const executedPath = process.argv[1];
if (executedPath !== undefined && pathToFileURL(resolve(executedPath)).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    process.exitCode = 1;
  });
}
