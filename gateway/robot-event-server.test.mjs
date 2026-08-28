import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  createGatewayRequestHandler,
  parseBatteryLowThreshold,
} from './server.mjs';

function createResponseRecorder() {
  const emitter = new EventEmitter();
  const result = { status: 0, headers: {}, body: '' };
  return {
    result,
    response: Object.assign(emitter, {
      end(body = '') {
        result.body += String(body);
      },
      flushHeaders() {},
      write(body) {
        result.body += String(body);
      },
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers;
      },
    }),
  };
}

test('배터리 부족 임계치는 명시된 0~100 숫자만 허용한다', () => {
  assert.equal(parseBatteryLowThreshold('20'), 20);
  assert.equal(parseBatteryLowThreshold('12.5'), 12.5);
  assert.throws(() => parseBatteryLowThreshold(undefined), /환경변수가 필요/u);
  assert.throws(() => parseBatteryLowThreshold('101'), /0 이상 100 이하/u);
});

test('이벤트 조회 조건을 검증해 event log의 페이지 결과를 반환한다', async () => {
  let receivedQuery;
  const page = {
    items: [],
    page: 2,
    pageSize: 20,
    totalItems: 21,
    totalPages: 2,
  };
  const eventLog = {
    queryEvents(query) {
      receivedQuery = query;
      return page;
    },
  };
  const handler = createGatewayRequestHandler({}, { eventLog });
  const { result, response } = createResponseRecorder();

  await handler({
    method: 'GET',
    url: '/api/integrations/patrol/events?page=2&pageSize=20&type=warning&robotId=robot-01&startMs=1000',
  }, response);

  assert.deepEqual(receivedQuery, {
    page: 2,
    pageSize: 20,
    robotId: 'robot-01',
    startMs: 1000,
    type: 'warning',
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(result.body), page);
});

test('잘못된 이벤트 조회 조건은 정규화된 400 응답으로 거절한다', async () => {
  const handler = createGatewayRequestHandler({}, {
    eventLog: { queryEvents: () => assert.fail('잘못된 query를 전달하면 안 됩니다.') },
  });
  const { result, response } = createResponseRecorder();

  await handler({
    method: 'GET',
    url: '/api/integrations/patrol/events?pageSize=101&type=unknown',
  }, response);

  assert.equal(result.status, 400);
  assert.deepEqual(JSON.parse(result.body), {
    code: 'INVALID_EVENT_QUERY',
    message: '지원하지 않는 이벤트 유형입니다.',
  });
});

test('새 운영 이벤트를 SSE로 전달하고 연결 종료 시 구독을 정리한다', async () => {
  const request = Object.assign(new EventEmitter(), {
    method: 'GET',
    url: '/api/integrations/patrol/events/stream',
  });
  let listener;
  let unsubscribed = false;
  const handler = createGatewayRequestHandler({}, {
    eventLog: {
      subscribe(nextListener) {
        listener = nextListener;
        return () => { unsubscribed = true; };
      },
    },
  });
  const { result, response } = createResponseRecorder();
  await handler(request, response);

  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  listener({
    id: 'event-1',
    robotId: 'robot-01',
    type: 'info',
    occurredAtMs: 100,
    title: '[OSA-1] 온라인 상태',
    detail: '로봇이 온라인 상태로 전환되었습니다.',
  });
  assert.match(result.body, /event: event-created/u);
  assert.match(result.body, /\[OSA-1\] 온라인 상태/u);

  request.emit('close');
  assert.equal(unsubscribed, true);
});
