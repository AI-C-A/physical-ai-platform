import assert from 'node:assert/strict';
import test from 'node:test';

import { createRobotEventLog } from './robot-event-log.mjs';

function createStatusPollingHarness() {
  const subscriptions = new Map();
  return {
    emit(robotId, event) {
      subscriptions.get(robotId)?.listener(event);
    },
    getSubscription(robotId) {
      return subscriptions.get(robotId);
    },
    statusPolling: {
      subscribe(robotId, listener, options) {
        const subscription = { active: true, listener, options };
        subscriptions.set(robotId, subscription);
        return () => {
          subscription.active = false;
          subscriptions.delete(robotId);
        };
      },
    },
    subscriptions,
  };
}

function statusEvent(robotId, battery, isConnecting, type = 'status-update') {
  return {
    type,
    robotId,
    data: {
      robotId,
      data: { battery, isConnecting },
    },
  };
}

test('온라인·오프라인·배터리 부족 전이만 중복 없이 기록한다', () => {
  let nowMs = 1_000;
  const harness = createStatusPollingHarness();
  const log = createRobotEventLog({
    batteryLowThreshold: 20,
    now: () => nowMs += 1,
    statusPolling: harness.statusPolling,
  });
  const notified = [];
  log.subscribe((event) => notified.push(event));
  log.start(['robot-01', 'robot-01']);

  assert.equal(harness.subscriptions.size, 1);
  assert.deepEqual(
    harness.getSubscription('robot-01').options,
    { continueOnError: true },
  );

  harness.emit('robot-01', statusEvent('robot-01', 80, true, 'status-snapshot'));
  harness.emit('robot-01', statusEvent('robot-01', 79, true));
  harness.emit('robot-01', statusEvent('robot-01', 20, true));
  harness.emit('robot-01', statusEvent('robot-01', 10, true));
  harness.emit('robot-01', { type: 'status-error', robotId: 'robot-01' });
  harness.emit('robot-01', { type: 'status-error', robotId: 'robot-01' });
  harness.emit('robot-01', statusEvent('robot-01', 25, true));
  harness.emit('robot-01', statusEvent('robot-01', 19, true));

  assert.deepEqual(
    log.listEvents().map((event) => event.title),
    [
      '[ADS-1] 배터리 부족',
      '[OSA-1] 온라인 상태',
      '[OSA-2] 오프라인 상태',
      '[ADS-1] 배터리 부족',
      '[OSA-1] 온라인 상태',
    ],
  );
  assert.equal(notified.length, 5);
  assert.match(log.listEvents()[0].detail, /19%.*20%/u);

  log.dispose();
  assert.equal(harness.subscriptions.size, 0);
});

test('유형·Robot·발생 시각 필터와 안정적인 페이지 결과를 반환한다', () => {
  let nowMs = 100;
  const harness = createStatusPollingHarness();
  const log = createRobotEventLog({
    batteryLowThreshold: 20,
    maxEvents: 3,
    now: () => nowMs += 10,
    statusPolling: harness.statusPolling,
  });
  log.start(['robot-a', 'robot-b']);

  harness.emit('robot-a', statusEvent('robot-a', 10, true, 'status-snapshot'));
  harness.emit('robot-b', statusEvent('robot-b', 80, false, 'status-snapshot'));
  harness.emit('robot-b', statusEvent('robot-b', 80, true));

  assert.equal(log.listEvents().length, 3, '보관 개수를 넘은 가장 오래된 이벤트를 제거한다');
  assert.deepEqual(log.queryEvents({
    page: 1,
    pageSize: 1,
    robotId: 'robot-b',
    startMs: 130,
    type: 'info',
  }), {
    items: [log.listEvents()[0]],
    page: 1,
    pageSize: 1,
    totalItems: 1,
    totalPages: 1,
  });
  log.dispose();
});

test('같은 발생 시각은 ID 오름차순으로 안정 정렬한다', () => {
  const harness = createStatusPollingHarness();
  const log = createRobotEventLog({
    batteryLowThreshold: 20,
    now: () => 100,
    statusPolling: harness.statusPolling,
  });
  log.start(['robot-a', 'robot-b']);

  harness.emit('robot-a', statusEvent('robot-a', 80, true, 'status-snapshot'));
  harness.emit('robot-b', statusEvent('robot-b', 80, true, 'status-snapshot'));

  assert.deepEqual(
    log.listEvents().map((event) => event.id),
    ['robot-event-100-000001', 'robot-event-100-000002'],
  );
  log.dispose();
});

test('배터리 임계치와 조회 조건을 명시적으로 검증한다', () => {
  const harness = createStatusPollingHarness();
  assert.throws(
    () => createRobotEventLog({ batteryLowThreshold: 101, statusPolling: harness.statusPolling }),
    /0 이상 100 이하/u,
  );

  const log = createRobotEventLog({
    batteryLowThreshold: 20,
    statusPolling: harness.statusPolling,
  });
  assert.throws(
    () => log.queryEvents({ page: 1, pageSize: 101, robotId: null, startMs: null, type: null }),
    /pageSize/u,
  );
  log.dispose();
});
