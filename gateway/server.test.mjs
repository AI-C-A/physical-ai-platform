import assert from 'node:assert/strict';
import test from 'node:test';

import { GatewayError } from './patrol-integration.mjs';
import {
  createGatewayRequestHandler,
  parsePatrolApiRequestTimeout,
} from './server.mjs';

function createResponseRecorder() {
  const result = { status: 0, headers: {}, body: '' };
  return {
    result,
    response: {
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers;
      },
      end(body) {
        result.body = String(body);
      },
    },
  };
}

test('Patrol API timeout 환경변수는 Node.js timer 범위의 양의 정수만 허용한다', () => {
  assert.equal(parsePatrolApiRequestTimeout('10000'), 10_000);
  for (const value of [undefined, '', '0', '-1', '1.5', '2147483648']) {
    assert.throws(
      () => parsePatrolApiRequestTimeout(value),
      /PATROL_API_REQUEST_TIMEOUT_MS/,
    );
  }
});

test('게이트웨이 응답은 no-store이며 허용된 내부 계약만 반환한다', async () => {
  const integration = {
    listRobots: async () => ({ items: [{ id: 'robot-a' }] }),
    getRobotStatus: async (robotId) => ({ robotId, battery: 100 }),
    createCameraViewerSession: async (robotId) => ({
      clientId: 'viewer',
      channelArn: `arn:${robotId}`,
      region: 'ap-northeast-2',
      iceServers: [],
      signedWssUrl: 'wss://signed.example.test/?signature=redacted',
    }),
  };
  const handler = createGatewayRequestHandler(integration);
  const { result, response } = createResponseRecorder();

  await handler({
    method: 'POST',
    url: '/api/integrations/patrol/robots/robot-a/camera-viewer-session',
  }, response);

  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.doesNotMatch(result.body, /apiKey|secretAccessKey|awsSecretKey/i);
  assert.deepEqual(JSON.parse(result.body), await integration.createCameraViewerSession('robot-a'));
});

test('예상하지 못한 오류와 원본 detail을 브라우저 응답에 노출하지 않는다', async () => {
  const integration = {
    listRobots: async () => {
      throw new Error('patrol-secret과 내부 stack');
    },
  };
  const handler = createGatewayRequestHandler(integration);
  const { result, response } = createResponseRecorder();

  await handler({ method: 'GET', url: '/api/integrations/patrol/robots' }, response);

  assert.equal(result.status, 500);
  assert.deepEqual(JSON.parse(result.body), {
    code: 'INTERNAL_ERROR',
    message: '연동 게이트웨이 요청을 처리하지 못했습니다.',
  });
  assert.doesNotMatch(result.body, /patrol-secret|stack/);
});

test('정규화된 GatewayError code만 유지한다', async () => {
  const integration = {
    getRobotStatus: async () => {
      throw new GatewayError(503, 'INTEGRATION_UNAVAILABLE', 'Patrol 서비스를 사용할 수 없습니다.');
    },
  };
  const handler = createGatewayRequestHandler(integration);
  const { result, response } = createResponseRecorder();

  await handler({
    method: 'GET',
    url: '/api/integrations/patrol/robots/robot-a/status',
  }, response);

  assert.equal(result.status, 503);
  assert.deepEqual(JSON.parse(result.body), {
    code: 'INTEGRATION_UNAVAILABLE',
    message: 'Patrol 서비스를 사용할 수 없습니다.',
  });
});
