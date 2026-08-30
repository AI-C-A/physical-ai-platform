const robotStatusPath = '/v1/openapi/patrol-course/robot_status/';

export class GatewayError extends Error {
  constructor(status, code, message, options = undefined) {
    super(message, options);
    this.name = 'GatewayError';
    this.status = status;
    this.code = code;
  }
}

function requireRecord(value, fieldName) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE', `${fieldName} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function requireString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE', `${fieldName} 형식이 올바르지 않습니다.`);
  }
  return value.trim();
}

function optionalString(value, fieldName) {
  if (value === null || value === undefined) return null;
  return requireString(value, fieldName);
}

function requireBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE', `${fieldName} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function requireFiniteNumber(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE', `${fieldName} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function requireNumberInRange(value, fieldName, minimum, maximum) {
  const number = requireFiniteNumber(value, fieldName);
  if (number < minimum || number > maximum) {
    throw new GatewayError(
      502,
      'INVALID_UPSTREAM_RESPONSE',
      `${fieldName} 값이 허용 범위를 벗어났습니다.`,
    );
  }
  return number;
}

function optionalNumberInRange(value, fieldName, minimum, maximum) {
  if (value === null) return null;
  return requireNumberInRange(value, fieldName, minimum, maximum);
}

function requirePositiveTimer(value, fieldName) {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new Error(`${fieldName}는 Node.js timer 범위 안의 양의 정수여야 합니다.`);
  }
  return value;
}

function parseHttpsOrigin(value) {
  const raw = requireEnvironmentString(value, 'PATROL_ORIGIN');
  let origin;
  try {
    origin = new URL(raw);
  } catch (error) {
    throw new Error('PATROL_ORIGIN이 유효한 URL이 아닙니다.', { cause: error });
  }
  if (origin.protocol !== 'https:' || origin.username !== '' || origin.password !== '') {
    throw new Error('PATROL_ORIGIN은 사용자 정보가 없는 HTTPS URL이어야 합니다.');
  }
  return origin;
}

function requireEnvironmentString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} 환경변수가 필요합니다.`);
  }
  return value.trim();
}

function requireUpstreamPath(value, fieldName) {
  const path = requireEnvironmentString(value, fieldName);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#')) {
    throw new Error(`${fieldName}은 query와 fragment가 없는 절대 경로여야 합니다.`);
  }
  return path;
}

export function parseRobotRegistrations(value) {
  let parsed;
  try {
    parsed = JSON.parse(requireEnvironmentString(value, 'PATROL_ROBOTS_JSON'));
  } catch (error) {
    throw new Error('PATROL_ROBOTS_JSON은 유효한 JSON이어야 합니다.', { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('PATROL_ROBOTS_JSON에는 하나 이상의 Robot 등록이 필요합니다.');
  }
  const ids = new Set();
  const serialNumbers = new Set();
  return parsed.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`PATROL_ROBOTS_JSON[${String(index)}]는 객체여야 합니다.`);
    }
    const id = requireEnvironmentString(item.id, `PATROL_ROBOTS_JSON[${String(index)}].id`);
    const serialNumber = requireEnvironmentString(
      item.serialNumber,
      `PATROL_ROBOTS_JSON[${String(index)}].serialNumber`,
    );
    const integrationProfileId = requireEnvironmentString(
      item.integrationProfileId,
      `PATROL_ROBOTS_JSON[${String(index)}].integrationProfileId`,
    );
    if (ids.has(id) || serialNumbers.has(serialNumber)) {
      throw new Error('PATROL_ROBOTS_JSON의 Robot ID와 serialNumber는 중복될 수 없습니다.');
    }
    ids.add(id);
    serialNumbers.add(serialNumber);
    return { id, serialNumber, integrationProfileId };
  });
}

export function parsePatrolRobotStatus(value) {
  const record = requireRecord(value, 'robot_status');
  const latitude = optionalNumberInRange(
    record.latitude,
    'robot_status.latitude',
    -90,
    90,
  );
  const longitude = optionalNumberInRange(
    record.longitude,
    'robot_status.longitude',
    -180,
    180,
  );
  const hasNoGpsSignal = latitude === 0 && longitude === 0;
  return {
    upstreamId: requireFiniteNumber(record.id, 'robot_status.id'),
    serialNumber: optionalString(record.serialNumber, 'robot_status.serialNumber'),
    name: optionalString(record.name, 'robot_status.name'),
    nickname: optionalString(record.nickname, 'robot_status.nickname'),
    battery: requireNumberInRange(record.battery, 'robot_status.battery', 0, 100),
    isConnecting: requireBoolean(record.isConnecting, 'robot_status.isConnecting'),
    latitude: hasNoGpsSignal ? null : latitude,
    longitude: hasNoGpsSignal ? null : longitude,
    isCharging: requireBoolean(record.isCharging, 'robot_status.isCharging'),
  };
}

export function parsePatrolCameraConfig(value) {
  const record = requireRecord(value, '카메라 설정');
  const config = {
    wssUrl: requireString(record.wssUrl, '카메라 설정.wssUrl'),
    httpsUrl: requireString(record.httpsUrl, '카메라 설정.httpsUrl'),
    channelArn: requireString(record.channelArn, '카메라 설정.channelArn'),
    awsRegion: requireString(record.awsRegion, '카메라 설정.awsRegion'),
    awsKey: requireString(record.awsKey, '카메라 설정.awsKey'),
    awsSecretKey: requireString(record.awsSecretKey, '카메라 설정.awsSecretKey'),
  };
  let wssUrl;
  let httpsUrl;
  try {
    wssUrl = new URL(config.wssUrl);
    httpsUrl = new URL(config.httpsUrl);
  } catch (error) {
    throw new GatewayError(
      502,
      'INVALID_UPSTREAM_RESPONSE',
      '카메라 endpoint 형식이 올바르지 않습니다.',
      { cause: error },
    );
  }
  if (wssUrl.protocol !== 'wss:' || httpsUrl.protocol !== 'https:') {
    throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE', '카메라 endpoint protocol이 올바르지 않습니다.');
  }
  if (!config.channelArn.startsWith(`arn:aws:kinesisvideo:${config.awsRegion}:`)) {
    throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE', '카메라 channel과 region이 일치하지 않습니다.');
  }
  return config;
}

function mapUpstreamFailure(status, code) {
  if (status === 400 && code === 'ROBOT_NOT_FOUND') {
    return new GatewayError(404, 'ROBOT_NOT_FOUND', '등록된 Robot을 찾지 못했습니다.');
  }
  if (status === 400) {
    return new GatewayError(502, 'VIDEO_NOT_CONFIGURED', 'Robot 카메라 접속 정보를 받지 못했습니다.');
  }
  if (status === 403) {
    return new GatewayError(502, 'INTEGRATION_CONFIGURATION_ERROR', 'Patrol 연동 인증을 확인해야 합니다.');
  }
  if (status >= 500) {
    return new GatewayError(503, 'INTEGRATION_UNAVAILABLE', 'Patrol 서비스를 사용할 수 없습니다.');
  }
  return new GatewayError(502, 'UPSTREAM_REQUEST_REJECTED', 'Patrol 요청이 거절되었습니다.');
}

async function readUpstreamCode(response) {
  try {
    const value = await response.json();
    return typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
      && typeof value.code === 'string'
      ? value.code
      : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

export function createPatrolIntegration(options) {
  const origin = parseHttpsOrigin(options.origin);
  const apiKey = requireEnvironmentString(options.apiKey, 'PATROL_API_KEY');
  const secret = requireEnvironmentString(options.secret, 'PATROL_API_SECRET');
  const cameraConfigPath = requireUpstreamPath(
    options.cameraConfigPath,
    'PATROL_CAMERA_CONFIG_PATH',
  );
  const registrations = options.registrations;
  const fetcher = options.fetcher ?? globalThis.fetch;
  const createViewerSession = options.createViewerSession;
  const requestTimeoutMs = requirePositiveTimer(
    options.requestTimeoutMs,
    'PATROL_API_REQUEST_TIMEOUT_MS',
  );
  if (typeof fetcher !== 'function') throw new Error('서버 fetch 구현이 필요합니다.');
  if (typeof createViewerSession !== 'function') throw new Error('Kinesis Viewer Session factory가 필요합니다.');

  const registrationsById = new Map(registrations.map((item) => [item.id, item]));

  function getRegistration(robotId) {
    const registration = registrationsById.get(robotId);
    if (registration === undefined) {
      throw new GatewayError(404, 'ROBOT_NOT_FOUND', '등록된 Robot을 찾지 못했습니다.');
    }
    return registration;
  }

  async function requestPatrol(path, registration) {
    const url = new URL(path, origin);
    url.searchParams.set('robotSerialNumber', registration.serialNumber);
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);
    try {
      let response;
      try {
        response = await fetcher(url, {
          method: 'GET',
          headers: { Accept: 'application/json', apiKey, secret },
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        });
      } catch (error) {
        if (timedOut) {
          throw new GatewayError(
            504,
            'UPSTREAM_TIMEOUT',
            'Patrol API 응답 시간이 초과되었습니다.',
            { cause: error },
          );
        }
        throw new GatewayError(
          503,
          'INTEGRATION_UNAVAILABLE',
          'Patrol 서비스에 연결하지 못했습니다.',
          { cause: error },
        );
      }
      if (!response.ok) {
        throw mapUpstreamFailure(response.status, await readUpstreamCode(response));
      }
      try {
        return await response.json();
      } catch (error) {
        if (timedOut) {
          throw new GatewayError(
            504,
            'UPSTREAM_TIMEOUT',
            'Patrol API 응답 시간이 초과되었습니다.',
            { cause: error },
          );
        }
        throw new GatewayError(
          502,
          'INVALID_UPSTREAM_RESPONSE',
          'Patrol JSON 응답을 확인하지 못했습니다.',
          { cause: error },
        );
      }
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  async function loadStatus(registration) {
    return parsePatrolRobotStatus(await requestPatrol(robotStatusPath, registration));
  }

  return {
    async listRobots() {
      const items = await Promise.all(registrations.map(async (registration) => {
        const status = await loadStatus(registration);
        return {
          id: registration.id,
          serialNumber: status.serialNumber,
          name: status.name,
          displayName: status.nickname ?? status.name ?? registration.serialNumber,
          integrationProfileId: registration.integrationProfileId,
        };
      }));
      return { items };
    },
    async getRobotStatus(robotId) {
      const registration = getRegistration(robotId);
      const status = await loadStatus(registration);
      return {
        robotId: registration.id,
        integrationProfileId: registration.integrationProfileId,
        data: {
          id: status.upstreamId,
          serialNumber: status.serialNumber,
          name: status.name,
          nickname: status.nickname,
          battery: status.battery,
          isConnecting: status.isConnecting,
          latitude: status.latitude,
          longitude: status.longitude,
          isCharging: status.isCharging,
        },
      };
    },
    async createCameraViewerSession(robotId) {
      const registration = getRegistration(robotId);
      const config = parsePatrolCameraConfig(await requestPatrol(cameraConfigPath, registration));
      return createViewerSession(config);
    },
  };
}
