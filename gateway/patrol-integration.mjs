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

function optionalBoolean(value, fieldName) {
  if (value === null || value === undefined) return null;
  return requireBoolean(value, fieldName);
}

function requireFiniteNumber(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE', `${fieldName} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function optionalFiniteNumber(value, fieldName) {
  if (value === null) return null;
  return requireFiniteNumber(value, fieldName);
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
  return {
    upstreamId: requireFiniteNumber(record.id, 'robot_status.id'),
    serialNumber: optionalString(record.serialNumber, 'robot_status.serialNumber'),
    name: optionalString(record.name, 'robot_status.name'),
    nickname: optionalString(record.nickname, 'robot_status.nickname'),
    description: optionalString(record.description, 'robot_status.description'),
    battery: requireFiniteNumber(record.battery, 'robot_status.battery'),
    isConnecting: requireBoolean(record.isConnecting, 'robot_status.isConnecting'),
    latitude: optionalFiniteNumber(record.latitude, 'robot_status.latitude'),
    longitude: optionalFiniteNumber(record.longitude, 'robot_status.longitude'),
    isAvailable: optionalBoolean(record.isAvailable, 'robot_status.isAvailable'),
    isCharging: requireBoolean(record.isCharging, 'robot_status.isCharging'),
    isMovable: requireBoolean(record.isMovable, 'robot_status.isMovable'),
    isHeadLightOn: requireBoolean(record.isHeadLightOn, 'robot_status.isHeadLightOn'),
    isCargoOpen: requireBoolean(record.isCargoOpen, 'robot_status.isCargoOpen'),
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
    let response;
    try {
      response = await fetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/json', apiKey, secret },
        cache: 'no-store',
        redirect: 'error',
      });
    } catch (error) {
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
      throw new GatewayError(
        502,
        'INVALID_UPSTREAM_RESPONSE',
        'Patrol JSON 응답을 확인하지 못했습니다.',
        { cause: error },
      );
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
          displayName: status.name ?? status.nickname ?? registration.serialNumber,
          description: status.description,
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
          description: status.description,
          battery: status.battery,
          isConnecting: status.isConnecting,
          latitude: status.latitude,
          longitude: status.longitude,
          isAvailable: status.isAvailable,
          isCharging: status.isCharging,
          isMovable: status.isMovable,
          isHeadLightOn: status.isHeadLightOn,
          isCargoOpen: status.isCargoOpen,
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
