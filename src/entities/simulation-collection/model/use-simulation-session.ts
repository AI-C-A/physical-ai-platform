import { useMemo, useSyncExternalStore } from 'react';

import { SimulationCodeClient, type SimulationSession } from '../api/simulation-code-client';
import { simulationRelayUrl } from '../api/simulation-origin';

const IDLE_SESSION: SimulationSession = { status: 'closed', code: null, publicOrigin: null };

interface SessionStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SimulationSession;
}

/**
 * 구독이 시작되면 릴레이 소켓을 열어 세션 코드를 발급받고, 마지막 구독이 끝나면 닫는다.
 * 소켓 수명을 React 구독에 묶어, 화면을 떠나면 코드를 놓아 준다(방이 비면 릴레이가 회수).
 */
function createSessionStore(url: string): SessionStore {
  let client: SimulationCodeClient | null = null;
  let subscribers = 0;
  return {
    subscribe(listener) {
      subscribers += 1;
      client ??= new SimulationCodeClient({ url });
      const unsubscribe = client.subscribe(listener);
      return () => {
        unsubscribe();
        subscribers -= 1;
        if (subscribers > 0) return;
        client?.close();
        client = null;
      };
    },
    getSnapshot: () => client?.getSnapshot() ?? IDLE_SESSION,
  };
}

const IDLE_STORE: SessionStore = { subscribe: () => () => {}, getSnapshot: () => IDLE_SESSION };

/** 릴레이에서 5자리 세션 코드와 공개 주소를 받아 온다. */
export function useSimulationSession({ enabled = true }: { readonly enabled?: boolean } = {}): SimulationSession {
  const store = useMemo(
    () => (enabled && typeof WebSocket !== 'undefined' ? createSessionStore(simulationRelayUrl()) : IDLE_STORE),
    [enabled],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => IDLE_SESSION);
}
