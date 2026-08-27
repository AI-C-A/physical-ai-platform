import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPatrolIntegration,
  GatewayError,
  parsePatrolRobotStatus,
  parseRobotRegistrations,
} from './patrol-integration.mjs';

const registration = {
  id: 'robot-a',
  serialNumber: 'SERIAL001',
  integrationProfileId: 'patrol-rest-v1',
};
const statusResponse = {
  id: 246,
  serialNumber: 'SERIAL001',
  name: '405',
  nickname: 'Robot A',
  description: null,
  battery: 100,
  isConnecting: true,
  latitude: 0,
  longitude: 0,
  isAvailable: false,
  isCharging: false,
  isMovable: true,
  isHeadLightOn: false,
  isCargoOpen: false,
};
const cameraResponse = {
  wssUrl: 'wss://v-example.kinesisvideo.ap-northeast-2.amazonaws.com',
  httpsUrl: 'https://r-example.kinesisvideo.ap-northeast-2.amazonaws.com',
  channelArn: 'arn:aws:kinesisvideo:ap-northeast-2:123456789012:channel/example/1',
  awsRegion: 'ap-northeast-2',
  awsKey: 'AWS_ACCESS_KEY',
  awsSecretKey: 'AWS_SECRET_KEY',
};

function createIntegration(fetcher, createViewerSession = async () => ({ ok: true })) {
  return createPatrolIntegration({
    origin: 'https://platform.example.test',
    apiKey: 'patrol-key',
    secret: 'patrol-secret',
    cameraConfigPath: '/camera-config/',
    registrations: [registration],
    fetcher,
    createViewerSession,
  });
}

test('서버 환경의 Robot allowlist를 엄격하게 검증한다', () => {
  assert.deepEqual(
    parseRobotRegistrations(JSON.stringify([registration])),
    [registration],
  );
  assert.throws(
    () => parseRobotRegistrations(JSON.stringify([registration, registration])),
    /중복/,
  );
});

test('robot_status 정상 응답을 Robot 카탈로그와 운영 상태 DTO로 투영한다', async () => {
  const requests = [];
  const integration = createIntegration(async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json(statusResponse);
  });

  assert.deepEqual(await integration.listRobots(), {
    items: [{
      id: 'robot-a',
      serialNumber: 'SERIAL001',
      displayName: '405',
      description: null,
      integrationProfileId: 'patrol-rest-v1',
    }],
  });
  assert.deepEqual(await integration.getRobotStatus('robot-a'), {
    robotId: 'robot-a',
    integrationProfileId: 'patrol-rest-v1',
    data: {
      id: 246,
      serialNumber: 'SERIAL001',
      name: '405',
      nickname: 'Robot A',
      description: null,
      battery: 100,
      isConnecting: true,
      latitude: 0,
      longitude: 0,
      isAvailable: false,
      isCharging: false,
      isMovable: true,
      isHeadLightOn: false,
      isCargoOpen: false,
    },
  });
  assert.equal(requests.length, 2);
  requests.forEach(({ url, init }) => {
    assert.match(url, /robotSerialNumber=SERIAL001/);
    assert.equal(init.headers.apiKey, 'patrol-key');
    assert.equal(init.headers.secret, 'patrol-secret');
  });
});

test('robot_status의 null serialNumber를 등록값으로 대체하지 않는다', async () => {
  const integration = createIntegration(async () => Response.json({
    ...statusResponse,
    serialNumber: null,
  }));

  const catalog = await integration.listRobots();
  const status = await integration.getRobotStatus('robot-a');

  assert.equal(catalog.items[0]?.serialNumber, null);
  assert.equal(status.data.serialNumber, null);
});

test('필수 boolean과 유한한 숫자가 아닌 upstream 응답을 거절한다', () => {
  assert.throws(
    () => parsePatrolRobotStatus({ ...statusResponse, isMovable: 'true' }),
    (error) => error instanceof GatewayError
      && error.status === 502
      && error.code === 'INVALID_UPSTREAM_RESPONSE',
  );
  assert.throws(
    () => parsePatrolRobotStatus({ ...statusResponse, battery: Number.NaN }),
    /battery/,
  );
});

test('미등록 Robot은 upstream 호출 없이 404로 거절한다', async () => {
  let called = false;
  const integration = createIntegration(async () => {
    called = true;
    return Response.json(statusResponse);
  });
  await assert.rejects(
    () => integration.getRobotStatus('unknown'),
    (error) => error instanceof GatewayError
      && error.status === 404
      && error.code === 'ROBOT_NOT_FOUND',
  );
  assert.equal(called, false);
});

test('upstream 인증 오류를 raw detail 없이 502로 정규화한다', async () => {
  const integration = createIntegration(async () => new Response(
    JSON.stringify({ code: 'INVALID_API_KEY', detail: '민감한 인증 상세' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  ));
  await assert.rejects(
    () => integration.getRobotStatus('robot-a'),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'INTEGRATION_CONFIGURATION_ERROR');
      assert.doesNotMatch(error.message, /민감한 인증 상세/);
      return true;
    },
  );
});

test('upstream Robot 없음과 서비스 장애를 각각 404와 503으로 정규화한다', async () => {
  const missing = createIntegration(async () => new Response(
    JSON.stringify({ code: 'ROBOT_NOT_FOUND', detail: 'upstream 내부 상세' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  ));
  await assert.rejects(
    () => missing.getRobotStatus('robot-a'),
    (error) => error instanceof GatewayError
      && error.status === 404
      && error.code === 'ROBOT_NOT_FOUND'
      && !error.message.includes('upstream 내부 상세'),
  );

  const unavailable = createIntegration(async () => new Response(
    JSON.stringify({ code: 'INTERNAL_ERROR', detail: 'stack trace' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } },
  ));
  await assert.rejects(
    () => unavailable.getRobotStatus('robot-a'),
    (error) => error instanceof GatewayError
      && error.status === 503
      && error.code === 'INTEGRATION_UNAVAILABLE'
      && !error.message.includes('stack trace'),
  );
});

test('upstream 네트워크 장애를 503으로 정규화한다', async () => {
  const integration = createIntegration(async () => {
    throw new Error('socket 내부 정보');
  });

  await assert.rejects(
    () => integration.getRobotStatus('robot-a'),
    (error) => error instanceof GatewayError
      && error.status === 503
      && error.code === 'INTEGRATION_UNAVAILABLE'
      && !error.message.includes('socket 내부 정보'),
  );
});

test('카메라 credential은 Viewer factory까지만 전달하고 반환값에는 포함하지 않는다', async () => {
  let receivedConfig;
  const integration = createIntegration(
    async (url) => Response.json(String(url).includes('camera-config') ? cameraResponse : statusResponse),
    async (config) => {
      receivedConfig = config;
      return {
        clientId: 'viewer-1',
        channelArn: config.channelArn,
        region: config.awsRegion,
        iceServers: [],
        signedWssUrl: 'wss://signed.example.test/?signature=redacted',
      };
    },
  );
  const result = await integration.createCameraViewerSession('robot-a');
  assert.equal(receivedConfig.awsKey, 'AWS_ACCESS_KEY');
  assert.equal(receivedConfig.awsSecretKey, 'AWS_SECRET_KEY');
  assert.doesNotMatch(JSON.stringify(result), /AWS_ACCESS_KEY|AWS_SECRET_KEY|patrol-secret/);
});
