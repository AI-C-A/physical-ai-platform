import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { simulationOrigin } from '../api/simulation-origin';
import {
  parseSimulationBridgeSnapshot,
  type SimulationBridgeEvent,
  type SimulationBridgeHand,
  type SimulationBridgeSnapshot,
  type SimulationBridgeTask,
} from './simulation-bridge';
import type { SimulationPeer, SimulationPeerMode } from './simulation-party';

export interface SimulationFeed {
  /** 최근 2초 안에 iframe 스냅샷을 받았는지. */
  readonly connected: boolean;
  readonly mode: SimulationPeerMode | null;
  readonly recording: boolean;
  readonly stats: { readonly frames: number; readonly events: number; readonly episodes: number; readonly tracked: number };
  readonly participants: readonly SimulationPeer[];
  readonly task: SimulationBridgeTask | null;
  readonly hands: readonly SimulationBridgeHand[];
  readonly head: readonly [number, number, number] | null;
  readonly heldCount: number;
  /** 스냅샷 수신 속도(Hz). 첫 스냅샷 전에는 null. */
  readonly rateHz: number | null;
  /** 오래된 순 → 최신 순. seq로 중복을 제거한 유한 목록. */
  readonly events: readonly SimulationBridgeEvent[];
  readonly lastAtMs: number | null;
}

export const IDLE_SIMULATION_FEED: SimulationFeed = {
  connected: false, mode: null, recording: false,
  stats: { frames: 0, events: 0, episodes: 0, tracked: 0 },
  participants: [], task: null, hands: [], head: null, heldCount: 0, rateHz: null, events: [], lastAtMs: null,
};

const EVENT_LIMIT = 60;
const STALE_MS = 2_000;
const PUBLISH_INTERVAL_MS = 150;
const RATE_SMOOTHING = 0.2;

export interface SimulationBridge {
  readonly feed: SimulationFeed;
  /** 캔버스 등 고주기 렌더링용 최신 스냅샷. React 리렌더를 유발하지 않는다. */
  readonly latestRef: MutableRefObject<SimulationBridgeSnapshot | null>;
}

/**
 * 임베드된 시뮬레이션(iframe)이 보내는 postMessage 스냅샷을 구독한다.
 *
 * 릴레이(WebSocket)와 달리 방을 거치지 않으므로, 같은 화면에서 시뮬레이션을 돌리는 시연은
 * 릴레이 상태와 무관하게 곧바로 값이 뜬다. 스냅샷은 `latestRef`에 즉시 담고 React 상태는
 * 목록(이벤트)만 절제된 주기로 갱신해, 10 Hz 스트림이 페이지 전체를 흔들지 않게 한다.
 */
export function useSimulationBridge({ enabled = true, origin }: { readonly enabled?: boolean; readonly origin?: string } = {}): SimulationBridge {
  const [feed, setFeed] = useState<SimulationFeed>(IDLE_SIMULATION_FEED);
  const latestRef = useRef<SimulationBridgeSnapshot | null>(null);
  const eventsRef = useRef<SimulationBridgeEvent[]>([]);
  const lastSeqRef = useRef<number>(0);
  const rateRef = useRef<number | null>(null);
  const lastAtRef = useRef<number | null>(null);
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    // 새 구독마다 누적값을 초기화한다(setState가 아니라 ref라 렌더를 부르지 않는다).
    latestRef.current = null;
    eventsRef.current = [];
    lastSeqRef.current = 0;
    rateRef.current = null;
    lastAtRef.current = null;
    const expectedOrigin = origin ?? simulationOrigin();

    const publish = () => {
      const snapshot = latestRef.current;
      if (snapshot === null) return;
      setFeed({
        connected: true,
        mode: snapshot.mode,
        recording: snapshot.recording,
        stats: { frames: snapshot.stats.frames, events: snapshot.stats.events, episodes: snapshot.stats.episodes, tracked: snapshot.stats.tracked },
        participants: snapshot.peers,
        task: snapshot.task,
        hands: snapshot.hands,
        head: snapshot.head,
        heldCount: snapshot.heldCount,
        rateHz: rateRef.current,
        events: eventsRef.current.slice(),
        lastAtMs: snapshot.receivedAtMs,
      });
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== expectedOrigin) return;
      const snapshot = parseSimulationBridgeSnapshot(event.data, Date.now());
      if (snapshot === null) return;
      const previousAt = lastAtRef.current;
      lastAtRef.current = snapshot.receivedAtMs;
      if (previousAt !== null) {
        const interval = snapshot.receivedAtMs - previousAt;
        if (interval > 0) {
          const instant = 1_000 / interval;
          rateRef.current = rateRef.current === null ? instant : rateRef.current + RATE_SMOOTHING * (instant - rateRef.current);
        }
      }
      latestRef.current = snapshot;
      // seq 기준으로 새 이벤트만 이어 붙인다(스냅샷은 최근 tail을 통째로 실어 온다).
      for (const item of snapshot.events) {
        if (item.seq <= lastSeqRef.current) continue;
        lastSeqRef.current = item.seq;
        eventsRef.current.push(item);
      }
      if (eventsRef.current.length > EVENT_LIMIT) eventsRef.current = eventsRef.current.slice(eventsRef.current.length - EVENT_LIMIT);
      if (publishTimerRef.current === null) publishTimerRef.current = setTimeout(() => { publishTimerRef.current = null; publish(); }, PUBLISH_INTERVAL_MS);
    };

    const stale = setInterval(() => {
      if (lastAtRef.current !== null && Date.now() - lastAtRef.current > STALE_MS) {
        rateRef.current = null;
        setFeed((current) => (current.connected ? { ...current, connected: false, rateHz: null } : current));
      }
    }, 500);

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(stale);
      if (publishTimerRef.current !== null) clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
    };
  }, [enabled, origin]);

  // 비활성일 때는 누적된 state 대신 idle을 노출한다(effect에서 setState 하지 않기 위함).
  return { feed: enabled ? feed : IDLE_SIMULATION_FEED, latestRef };
}
