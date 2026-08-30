const eventTypes = new Set(['info', 'warning', 'error']);

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName}은 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value.trim();
}

function requirePositiveInteger(value, fieldName, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${fieldName}은 1 이상 ${String(maximum)} 이하의 정수여야 합니다.`);
  }
  return value;
}

function requireNullableFiniteNumber(value, fieldName) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName}은 null 또는 유한한 숫자여야 합니다.`);
  }
  return value;
}

function createPageResult(items, request) {
  const totalPages = Math.max(1, Math.ceil(items.length / request.pageSize));
  const page = Math.min(request.page, totalPages);
  return {
    items: items.slice((page - 1) * request.pageSize, page * request.pageSize),
    page,
    pageSize: request.pageSize,
    totalItems: items.length,
    totalPages,
  };
}

function sortEvents(items) {
  return [...items].sort((left, right) => {
    const primary = right.occurredAtMs - left.occurredAtMs;
    return primary === 0 ? left.id.localeCompare(right.id) : primary;
  });
}

function readStatusSnapshot(event) {
  if (event?.type !== 'status-snapshot' && event?.type !== 'status-update') return null;
  const robotId = typeof event.robotId === 'string' ? event.robotId : null;
  const data = event.data?.data;
  if (
    robotId === null
    || typeof data !== 'object'
    || data === null
    || typeof data.isConnecting !== 'boolean'
    || typeof data.battery !== 'number'
    || !Number.isFinite(data.battery)
  ) {
    return null;
  }
  return { battery: data.battery, isConnecting: data.isConnecting, robotId };
}

/**
 * 상태 polling 결과의 전이만 운영 이벤트로 축적한다.
 * 동일 상태의 반복 조회는 이벤트를 만들지 않고, 게이트웨이 실행 중 최근 항목만 유지한다.
 */
export function createRobotEventLog(options) {
  if (typeof options?.statusPolling?.subscribe !== 'function') {
    throw new TypeError('상태 polling service가 필요합니다.');
  }
  const batteryLowThreshold = options.batteryLowThreshold;
  if (
    typeof batteryLowThreshold !== 'number'
    || !Number.isFinite(batteryLowThreshold)
    || batteryLowThreshold < 0
    || batteryLowThreshold > 100
  ) {
    throw new RangeError('배터리 부족 임계치는 0 이상 100 이하의 유한한 숫자여야 합니다.');
  }
  const maxEvents = requirePositiveInteger(options.maxEvents ?? 10_000, '이벤트 보관 개수');
  const now = options.now ?? Date.now;
  if (typeof now !== 'function') throw new TypeError('현재 시각 함수가 필요합니다.');

  const events = [];
  const listeners = new Set();
  const states = new Map();
  const watchers = new Map();
  let disposed = false;
  let sequence = 0;

  function requireActive() {
    if (disposed) throw new Error('이벤트 로그가 종료되었습니다.');
  }

  function getState(robotId) {
    let state = states.get(robotId);
    if (state === undefined) {
      state = { batteryLow: undefined, online: undefined };
      states.set(robotId, state);
    }
    return state;
  }

  function appendEvent(robotId, type, title, detail) {
    sequence += 1;
    const occurredAtMs = now();
    const event = {
      id: `robot-event-${String(occurredAtMs)}-${String(sequence).padStart(6, '0')}`,
      robotId,
      type,
      occurredAtMs,
      title,
      detail,
    };
    events.unshift(event);
    if (events.length > maxEvents) events.length = maxEvents;
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // 한 구독자에게 전송하지 못해도 수집과 다른 구독자 전송은 계속한다.
      }
    }
  }

  function recordOnlineState(robotId, online) {
    const state = getState(robotId);
    if (state.online === online) return;
    state.online = online;
    if (online) {
      appendEvent(
        robotId,
        'info',
        '[OSA-1] 온라인 상태',
        '로봇이 온라인 상태로 전환되었습니다.',
      );
    } else {
      appendEvent(
        robotId,
        'error',
        '[OSA-2] 오프라인 상태',
        '로봇이 오프라인 상태로 전환되었습니다.',
      );
    }
  }

  function recordBatteryState(robotId, battery) {
    const state = getState(robotId);
    const batteryLow = battery <= batteryLowThreshold;
    if (state.batteryLow === batteryLow) return;
    state.batteryLow = batteryLow;
    if (!batteryLow) return;
    appendEvent(
      robotId,
      'warning',
      '[ADS-1] 배터리 부족',
      `배터리 잔량이 ${String(battery)}%로 임계치 ${String(batteryLowThreshold)}% 이하입니다.`,
    );
  }

  function receiveStatusEvent(event) {
    if (event?.type === 'status-error' && typeof event.robotId === 'string') {
      recordOnlineState(event.robotId, false);
      return;
    }
    const snapshot = readStatusSnapshot(event);
    if (snapshot === null) return;
    recordOnlineState(snapshot.robotId, snapshot.isConnecting);
    recordBatteryState(snapshot.robotId, snapshot.battery);
  }

  return {
    listEvents() {
      requireActive();
      return sortEvents(events);
    },

    queryEvents(query) {
      requireActive();
      const page = requirePositiveInteger(query?.page, 'page');
      const pageSize = requirePositiveInteger(query?.pageSize, 'pageSize', 100);
      const type = query?.type === null
        ? null
        : requireNonEmptyString(query?.type, 'type');
      if (type !== null && !eventTypes.has(type)) {
        throw new RangeError('지원하지 않는 이벤트 유형입니다.');
      }
      const robotId = query?.robotId === null
        ? null
        : requireNonEmptyString(query?.robotId, 'robotId');
      const startMs = requireNullableFiniteNumber(query?.startMs, 'startMs');
      const filtered = sortEvents(events.filter((event) => (
        (type === null || event.type === type)
        && (robotId === null || event.robotId === robotId)
        && (startMs === null || event.occurredAtMs >= startMs)
      )));
      return createPageResult(filtered, { page, pageSize });
    },

    start(robotIds) {
      requireActive();
      if (!Array.isArray(robotIds)) throw new TypeError('Robot ID 목록이 필요합니다.');
      const normalizedIds = [...new Set(
        robotIds.map((robotId) => requireNonEmptyString(robotId, 'Robot ID')),
      )].sort();
      const created = [];
      try {
        for (const robotId of normalizedIds) {
          if (watchers.has(robotId)) continue;
          const unsubscribe = options.statusPolling.subscribe(
            robotId,
            receiveStatusEvent,
            { continueOnError: true },
          );
          watchers.set(robotId, unsubscribe);
          created.push(robotId);
        }
      } catch (error) {
        for (const robotId of created) {
          watchers.get(robotId)?.();
          watchers.delete(robotId);
        }
        throw error;
      }
    },

    subscribe(listener) {
      requireActive();
      if (typeof listener !== 'function') throw new TypeError('이벤트 listener가 필요합니다.');
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of watchers.values()) unsubscribe();
      watchers.clear();
      listeners.clear();
      states.clear();
    },
  };
}
