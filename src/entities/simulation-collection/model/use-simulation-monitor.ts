import { useMemo, useSyncExternalStore } from 'react';

import { SimulationPartyClient } from '../api/simulation-party-client';
import { simulationRelayUrl } from '../api/simulation-origin';
import {
  INITIAL_SIMULATION_MONITOR_STATE,
  selectSimulationOperator,
  type SimulationMonitorState,
  type SimulationOperatorSnapshot,
} from './simulation-monitor';

export interface SimulationMonitorOptions {
  readonly room: string;
  /** 릴레이에 보이는 이 모니터의 이름. */
  readonly name: string;
  /** 같은 화면에 띄운 시뮬레이션 iframe의 참가자 이름. 통계에서 제외한다. */
  readonly ignoredPeerNames?: readonly string[];
  readonly enabled?: boolean;
}

export interface SimulationMonitor {
  readonly state: SimulationMonitorState;
  readonly operator: SimulationOperatorSnapshot | null;
}

const IDLE_STATE: SimulationMonitorState = { ...INITIAL_SIMULATION_MONITOR_STATE, relay: 'closed' };

interface MonitorStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SimulationMonitorState;
}

/**
 * 구독이 시작될 때 소켓을 열고 마지막 구독이 끝날 때 닫는다.
 * 소켓 수명을 React 구독에 묶어 방이 바뀌거나 화면을 떠나면 이전 연결이 남지 않게 한다.
 */
function createMonitorStore(url: string, name: string, ignoredPeerNames: readonly string[]): MonitorStore {
  let client: SimulationPartyClient | null = null;
  let subscribers = 0;
  return {
    subscribe(listener) {
      subscribers += 1;
      client ??= new SimulationPartyClient({ url, name, ignoredPeerNames });
      const unsubscribe = client.subscribe(listener);
      return () => {
        unsubscribe();
        subscribers -= 1;
        if (subscribers > 0) return;
        client?.close();
        client = null;
      };
    },
    getSnapshot: () => client?.getSnapshot() ?? IDLE_STATE,
  };
}

const IDLE_STORE: MonitorStore = { subscribe: () => () => {}, getSnapshot: () => IDLE_STATE };

export function useSimulationMonitor({ room, name, ignoredPeerNames, enabled = true }: SimulationMonitorOptions): SimulationMonitor {
  const ignored = useMemo(() => ignoredPeerNames ?? [], [ignoredPeerNames]);
  const store = useMemo(
    () => (enabled && typeof WebSocket !== 'undefined' ? createMonitorStore(simulationRelayUrl(room), name, ignored) : IDLE_STORE),
    [enabled, room, name, ignored],
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => IDLE_STATE);
  const operator = useMemo(() => selectSimulationOperator(state, ignored), [state, ignored]);
  return { state, operator };
}
