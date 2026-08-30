function assertRobotId(robotId) {
  if (typeof robotId !== 'string' || robotId.trim() === '') {
    throw new TypeError('Robot ID는 비어 있지 않은 문자열이어야 합니다.');
  }
  return robotId.trim();
}

function createPublicPollingFailure(robotId, lastSuccessfulAtMs) {
  return {
    robotId,
    code: 'STATUS_POLL_FAILED',
    message: '오프라인',
    lastSuccessfulAtMs,
  };
}

/**
 * 같은 Robot을 구독하는 모든 SSE 연결은 Patrol API polling 하나를 공유한다.
 * 마지막 구독이 해제되면 timer를 멈추고, 새 구독이 생기면 즉시 최신 상태를 확인한다.
 */
export function createStatusPollingService(options) {
  const loadStatus = options.loadStatus;
  const pollIntervalMs = options.pollIntervalMs;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;

  if (typeof loadStatus !== 'function') throw new TypeError('상태 조회 함수가 필요합니다.');
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 2_147_483_647) {
    throw new RangeError(
      '상태 poll 주기는 Node.js timer 범위 안의 양의 정수로 명시해야 합니다.',
    );
  }

  const states = new Map();
  let disposed = false;
  let eventSequence = 0;

  function requireActive() {
    if (disposed) throw new Error('상태 polling service가 종료되었습니다.');
  }

  function getState(robotId) {
    let state = states.get(robotId);
    if (state === undefined) {
      state = {
        continuousListeners: new Set(),
        inFlight: null,
        lastSerialized: null,
        lastSuccessfulAtMs: null,
        latest: undefined,
        pollFailed: false,
        listeners: new Set(),
        timer: null,
      };
      states.set(robotId, state);
    }
    return state;
  }

  function notify(state, event) {
    for (const listener of [...state.listeners]) {
      try {
        listener(event);
      } catch {
        // 한 SSE 응답의 쓰기 오류가 다른 구독자의 갱신을 막지 않게 격리한다.
      }
    }
  }

  function createEvent(type, robotId, data) {
    eventSequence += 1;
    return {
      id: String(eventSequence),
      type,
      robotId,
      data,
    };
  }

  function schedule(robotId, state) {
    if (disposed || state.listeners.size === 0 || state.timer !== null) return;
    state.timer = setTimer(() => {
      state.timer = null;
      pollAndSchedule(robotId, state);
    }, pollIntervalMs);
    state.timer?.unref?.();
  }

  function releaseInactiveState(robotId, state) {
    if (state.listeners.size > 0 || states.get(robotId) !== state) return;
    if (state.timer !== null) {
      clearTimer(state.timer);
      state.timer = null;
    }
    if (state.inFlight === null) states.delete(robotId);
  }

  function pollAndSchedule(robotId, state) {
    void refresh(robotId, state).then(
      () => schedule(robotId, state),
      () => {
        if (state.continuousListeners.size > 0) schedule(robotId, state);
      },
    );
  }

  function refresh(robotId, state) {
    if (state.inFlight !== null) return state.inFlight;

    const request = Promise.resolve().then(() => loadStatus(robotId));
    const trackedRequest = request.then(
      (status) => {
        if (state.inFlight === trackedRequest) state.inFlight = null;
        const serialized = JSON.stringify(status);
        const firstSnapshot = state.latest === undefined;
        const recovered = state.pollFailed;
        const changed = serialized !== state.lastSerialized;
        state.latest = status;
        state.lastSerialized = serialized;
        state.lastSuccessfulAtMs = now();
        state.pollFailed = false;
        if (changed || recovered) {
          notify(
            state,
            createEvent(firstSnapshot ? 'status-snapshot' : 'status-update', robotId, status),
          );
        }
        releaseInactiveState(robotId, state);
        return status;
      },
      (error) => {
        if (state.inFlight === trackedRequest) state.inFlight = null;
        state.pollFailed = true;
        if (state.listeners.size > 0) {
          notify(
            state,
            createEvent(
              'status-error',
              robotId,
              createPublicPollingFailure(robotId, state.lastSuccessfulAtMs),
            ),
          );
        }
        releaseInactiveState(robotId, state);
        throw error;
      },
    );
    state.inFlight = trackedRequest;
    return trackedRequest;
  }

  return {
    async getStatus(robotIdValue) {
      requireActive();
      const robotId = assertRobotId(robotIdValue);
      const state = getState(robotId);
      const latestIsFresh = state.latest !== undefined
        && state.lastSuccessfulAtMs !== null
        && now() - state.lastSuccessfulAtMs < pollIntervalMs;
      if (latestIsFresh) {
        releaseInactiveState(robotId, state);
        return state.latest;
      }
      try {
        const status = await refresh(robotId, state);
        schedule(robotId, state);
        releaseInactiveState(robotId, state);
        return status;
      } catch (error) {
        releaseInactiveState(robotId, state);
        throw error;
      }
    },

    subscribe(robotIdValue, listener, subscriptionOptions = {}) {
      requireActive();
      if (typeof listener !== 'function') throw new TypeError('상태 listener가 필요합니다.');
      if (
        subscriptionOptions.continueOnError !== undefined
        && typeof subscriptionOptions.continueOnError !== 'boolean'
      ) {
        throw new TypeError('continueOnError는 boolean이어야 합니다.');
      }
      const robotId = assertRobotId(robotIdValue);
      const state = getState(robotId);
      const wasInactive = state.listeners.size === 0;
      state.listeners.add(listener);
      if (subscriptionOptions.continueOnError === true) {
        state.continuousListeners.add(listener);
      }

      if (state.latest !== undefined && !state.pollFailed) {
        listener(createEvent('status-snapshot', robotId, state.latest));
      }
      if (wasInactive) {
        pollAndSchedule(robotId, state);
      }

      let active = true;
      return () => {
        if (!active) return;
        active = false;
        state.listeners.delete(listener);
        state.continuousListeners.delete(listener);
        releaseInactiveState(robotId, state);
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const state of states.values()) {
        if (state.timer !== null) clearTimer(state.timer);
        state.timer = null;
        state.continuousListeners.clear();
        state.listeners.clear();
      }
      states.clear();
    },
  };
}
