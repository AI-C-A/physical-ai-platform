import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createGatewayRequestHandler } from './server.mjs';

function createExchange(method, url) {
  const request = new EventEmitter();
  request.method = method;
  request.url = url;
  const responseEvents = new EventEmitter();
  const result = { status: 0, headers: {}, body: '', ended: false };
  const response = {
    end(body = '') {
      result.body += String(body);
      result.ended = true;
    },
    flushHeaders() {},
    on: responseEvents.on.bind(responseEvents),
    write(chunk) {
      result.body += String(chunk);
      return true;
    },
    writeHead(status, headers) {
      result.status = status;
      result.headers = headers;
    },
  };
  return { request, response, result };
}

test('여러 Robot 상태를 한 SSE 응답에 multiplex하고 연결 종료 시 구독을 해제한다', async () => {
  const subscribed = [];
  const unsubscribed = [];
  let sequence = 0;
  const statusPolling = {
    subscribe(robotId, listener) {
      subscribed.push(robotId);
      sequence += 1;
      listener({
        id: String(sequence),
        type: 'status-snapshot',
        data: { robotId, data: { battery: 80 } },
      });
      return () => unsubscribed.push(robotId);
    },
  };
  const handler = createGatewayRequestHandler({}, { statusPolling });
  const exchange = createExchange(
    'GET',
    '/api/integrations/patrol/robot-status/events?robotId=robot-02&robotId=robot-01',
  );

  await handler(exchange.request, exchange.response);

  assert.equal(exchange.result.status, 200);
  assert.equal(exchange.result.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.equal(exchange.result.headers['X-Accel-Buffering'], 'no');
  assert.deepEqual(subscribed, ['robot-02', 'robot-01']);
  assert.doesNotMatch(exchange.result.body, /^retry:/m);
  assert.match(exchange.result.body, /event: status-snapshot/);
  assert.match(exchange.result.body, /"robotId":"robot-02"/);
  assert.equal(exchange.result.ended, false);

  exchange.request.emit('close');
  assert.deepEqual(unsubscribed, ['robot-02', 'robot-01']);
});

test('일반 상태 GET도 polling cache를 통하도록 위임한다', async () => {
  const statusPolling = {
    getStatus: async (robotId) => ({ robotId, data: { battery: 77 } }),
  };
  const handler = createGatewayRequestHandler({}, { statusPolling });
  const exchange = createExchange(
    'GET',
    '/api/integrations/patrol/robots/robot-01/status',
  );

  await handler(exchange.request, exchange.response);

  assert.equal(exchange.result.status, 200);
  assert.deepEqual(JSON.parse(exchange.result.body), {
    robotId: 'robot-01',
    data: { battery: 77 },
  });
});

test('Robot ID가 없는 SSE 요청은 연결을 열지 않고 400으로 거절한다', async () => {
  const handler = createGatewayRequestHandler({}, { statusPolling: {} });
  const exchange = createExchange('GET', '/api/integrations/patrol/robot-status/events');

  await handler(exchange.request, exchange.response);

  assert.equal(exchange.result.status, 400);
  assert.deepEqual(JSON.parse(exchange.result.body), {
    code: 'ROBOT_IDS_REQUIRED',
    message: '상태 stream에는 Robot ID가 필요합니다.',
  });
});
