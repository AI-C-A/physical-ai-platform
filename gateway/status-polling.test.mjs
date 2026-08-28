import assert from 'node:assert/strict';
import test from 'node:test';

import { createStatusPollingService } from './status-polling.mjs';

function createTimerHarness() {
  const handles = [];
  return {
    handles,
    clearTimer(handle) {
      handle.cleared = true;
    },
    setTimer(callback) {
      const handle = {
        callback,
        cleared: false,
        unref() {},
      };
      handles.push(handle);
      return handle;
    },
  };
}

test('승인된 poll 주기를 명시하지 않으면 service를 만들지 않는다', () => {
  assert.throws(
    () => createStatusPollingService({ loadStatus: async () => ({}) }),
    /양의 정수로 명시/,
  );
});

test('같은 Robot 구독자는 하나의 poll을 공유하고 변경된 상태만 받는다', async () => {
  let battery = 80;
  let loadCount = 0;
  let nowMs = 0;
  const timers = createTimerHarness();
  const service = createStatusPollingService({
    clearTimer: timers.clearTimer,
    loadStatus: async (robotId) => {
      loadCount += 1;
      return { robotId, data: { battery } };
    },
    now: () => nowMs,
    pollIntervalMs: 250,
    setTimer: timers.setTimer,
  });
  const firstEvents = [];
  const secondEvents = [];
  const unsubscribeFirst = service.subscribe('robot-01', (event) => firstEvents.push(event));
  const unsubscribeSecond = service.subscribe('robot-01', (event) => secondEvents.push(event));

  await service.getStatus('robot-01');

  assert.equal(loadCount, 1);
  assert.deepEqual(firstEvents.map((event) => event.type), ['status-snapshot']);
  assert.deepEqual(secondEvents.map((event) => event.type), ['status-snapshot']);

  nowMs = 250;
  await service.getStatus('robot-01');
  assert.equal(loadCount, 2);
  assert.equal(firstEvents.length, 1, '같은 payload는 다시 전송하지 않는다');

  battery = 79;
  nowMs = 500;
  await service.getStatus('robot-01');
  assert.equal(loadCount, 3);
  assert.equal(firstEvents.at(-1).type, 'status-update');
  assert.equal(firstEvents.at(-1).data.data.battery, 79);
  assert.equal(secondEvents.at(-1).type, 'status-update');

  unsubscribeFirst();
  unsubscribeSecond();
  assert.equal(timers.handles.at(-1).cleared, true, '마지막 구독 해제 시 timer를 중단한다');

  const resumedEvents = [];
  const unsubscribeResumed = service.subscribe('robot-01', (event) => resumedEvents.push(event));
  await service.getStatus('robot-01');
  assert.equal(loadCount, 4, '마지막 구독 해제 뒤에는 이전 cache를 재사용하지 않는다');
  assert.equal(resumedEvents.at(-1).type, 'status-snapshot');
  assert.equal(resumedEvents.at(-1).data.data.battery, 79);
  unsubscribeResumed();
  service.dispose();
});

test('진행 중 poll은 마지막 구독 해제 직후 재구독해도 공유한다', async () => {
  let loadCount = 0;
  let resolveStatus = () => undefined;
  const pendingStatus = new Promise((resolve) => {
    resolveStatus = () => resolve({ robotId: 'robot-01', data: { battery: 80 } });
  });
  const service = createStatusPollingService({
    loadStatus: () => {
      loadCount += 1;
      return pendingStatus;
    },
    pollIntervalMs: 250,
  });
  const firstUnsubscribe = service.subscribe('robot-01', () => undefined);
  await Promise.resolve();

  firstUnsubscribe();
  const events = [];
  const secondUnsubscribe = service.subscribe('robot-01', (event) => events.push(event));
  const statusRequest = service.getStatus('robot-01');
  await Promise.resolve();

  assert.equal(loadCount, 1);
  resolveStatus();
  await statusRequest;
  assert.deepEqual(events.map((event) => event.type), ['status-snapshot']);

  secondUnsubscribe();
  service.dispose();
});

test('poll 실패 후 자동 요청을 멈추고 명시적 Retry 성공 때 복구한다', async () => {
  let shouldFail = false;
  let nowMs = 10;
  const timers = createTimerHarness();
  const service = createStatusPollingService({
    clearTimer: timers.clearTimer,
    loadStatus: async (robotId) => {
      if (shouldFail) throw new Error('api-secret 내부 오류');
      return { robotId, data: { battery: 80 } };
    },
    now: () => nowMs,
    pollIntervalMs: 250,
    setTimer: timers.setTimer,
  });
  const events = [];
  let resolveFailureEvent = () => undefined;
  const failureEvent = new Promise((resolve) => {
    resolveFailureEvent = resolve;
  });
  const unsubscribe = service.subscribe('robot-01', (event) => {
    events.push(event);
    if (event.type === 'status-error') resolveFailureEvent();
  });
  await service.getStatus('robot-01');

  shouldFail = true;
  nowMs = 260;
  timers.handles.at(-1).callback();
  await failureEvent;

  assert.deepEqual(events.at(-1), {
    id: '2',
    type: 'status-error',
    robotId: 'robot-01',
    data: {
      robotId: 'robot-01',
      code: 'STATUS_POLL_FAILED',
      message: '오프라인',
      lastSuccessfulAtMs: 10,
    },
  });
  assert.doesNotMatch(JSON.stringify(events.at(-1)), /api-secret/);
  assert.equal(timers.handles.length, 1, '실패한 poll 뒤에는 다음 timer를 만들지 않는다');

  shouldFail = false;
  await service.getStatus('robot-01');
  assert.equal(events.at(-1).type, 'status-update', '같은 payload도 복구 event로 전송한다');
  assert.equal(timers.handles.length, 2, 'Retry 성공 뒤에만 timer를 다시 만든다');

  unsubscribe();
  service.dispose();
});
