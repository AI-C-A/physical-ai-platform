import { useMemo, useSyncExternalStore } from 'react';

import { SimulationCodeClient, type SimulationSession } from '../api/simulation-code-client';
import { simulationRelayUrl } from '../api/simulation-origin';

const IDLE_SESSION: SimulationSession = { status: 'closed', code: null, publicOrigin: null };

interface SessionStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SimulationSession;
}

/** sessionStorage는 시크릿/차단 환경에서 던질 수 있으니 언제나 감싼다. */
function readStored(key: string | undefined): string | null {
  if (key === undefined) return null;
  try {
    const value = sessionStorage.getItem(key);
    return value !== null && /^\d{5}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string | undefined, code: string): void {
  if (key === undefined) return;
  try {
    sessionStorage.setItem(key, code);
  } catch {
    /* 저장 불가: 코드는 릴레이가 계속 쥐고 있으니 무시 */
  }
}

/**
 * 구독이 시작되면 릴레이 소켓을 열어 세션 코드를 발급받고, 마지막 구독이 끝나면 닫는다.
 * 코드는 세션별로 sessionStorage에 남겨, PC를 새로고침해도 같은 코드 방을 재사용한다
 * (아직 살아 있으면). 그래서 헤드셋이 입력한 코드가 새로고침으로 무효가 되지 않는다.
 */
function createSessionStore(url: string, storageKey?: string): SessionStore {
  let client: SimulationCodeClient | null = null;
  let subscribers = 0;
  return {
    subscribe(listener) {
      subscribers += 1;
      client ??= new SimulationCodeClient({
        url,
        initialCode: readStored(storageKey),
        onCode: (code) => writeStored(storageKey, code),
      });
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

/** 릴레이에서 5자리 세션 코드와 공개 주소를 받아 온다. `storageKey`로 새로고침 후 코드를 재사용한다. */
export function useSimulationSession({ enabled = true, storageKey }: { readonly enabled?: boolean; readonly storageKey?: string } = {}): SimulationSession {
  const store = useMemo(
    () => (enabled && typeof WebSocket !== 'undefined' ? createSessionStore(simulationRelayUrl(), storageKey) : IDLE_STORE),
    [enabled, storageKey],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => IDLE_SESSION);
}
