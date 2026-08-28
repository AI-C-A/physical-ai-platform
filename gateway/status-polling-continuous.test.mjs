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
      const handle = { callback, cleared: false, unref() {} };
      handles.push(handle);
      return handle;
    },
  };
}

test('지속 구독만 poll 실패 뒤 승인된 주기로 자동 복구를 시도한다', async () => {
  let loadCount = 0;
  let shouldFail = false;
  const timers = createTimerHarness();
  const service = createStatusPollingService({
    clearTimer: timers.clearTimer,
    loadStatus: async (robotId) => {
      loadCount += 1;
      if (shouldFail) throw new Error('upstream 실패');
      return { robotId, data: { battery: 80, isConnecting: true } };
    },
    pollIntervalMs: 250,
    setTimer: timers.setTimer,
  });
  const events = [];
  const unsubscribe = service.subscribe(
    'robot-01',
    (event) => events.push(event),
    { continueOnError: true },
  );
  await service.getStatus('robot-01');

  shouldFail = true;
  timers.handles.at(-1).callback();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(events.at(-1).type, 'status-error');
  assert.equal(timers.handles.length, 2, '실패 뒤 다음 retry timer를 만든다');

  shouldFail = false;
  timers.handles.at(-1).callback();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(loadCount, 3);
  assert.equal(events.at(-1).type, 'status-update');
  assert.equal(timers.handles.length, 3, '복구 뒤 정상 polling 주기를 계속한다');

  unsubscribe();
  service.dispose();
});

test('일반 구독은 기존처럼 실패 후 자동 재시도하지 않는다', async () => {
  const timers = createTimerHarness();
  let shouldFail = false;
  const service = createStatusPollingService({
    clearTimer: timers.clearTimer,
    loadStatus: async (robotId) => {
      if (shouldFail) throw new Error('upstream 실패');
      return { robotId, data: { battery: 80, isConnecting: true } };
    },
    pollIntervalMs: 250,
    setTimer: timers.setTimer,
  });
  const unsubscribe = service.subscribe('robot-01', () => undefined);
  await service.getStatus('robot-01');

  shouldFail = true;
  timers.handles.at(-1).callback();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(timers.handles.length, 1);
  unsubscribe();
  service.dispose();
});
