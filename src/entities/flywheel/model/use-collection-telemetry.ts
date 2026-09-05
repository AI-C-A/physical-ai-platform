import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';

import type {
  CollectionTelemetryConnectionState,
  CollectionTelemetrySnapshot,
} from './flywheel';
import { useFlywheelPort } from './flywheel-context';

export function getEffectiveCollectionConnectionState(
  snapshot: CollectionTelemetrySnapshot,
  nowMs: number,
  refreshError: string | null,
): CollectionTelemetryConnectionState {
  if (refreshError !== null) return 'offline';
  if (snapshot.connectionState === 'offline') return 'offline';
  const ageMs = Math.max(0, nowMs - snapshot.observedAtMs);
  if (snapshot.connectionState === 'stale' || ageMs >= snapshot.freshness.staleAfterMs) {
    return ageMs >= snapshot.freshness.offlineAfterMs ? 'offline' : 'stale';
  }
  return 'live';
}

export type CollectionTelemetryQuery = AsyncQueryState<CollectionTelemetrySnapshot | null> & {
  readonly effectiveConnectionState: CollectionTelemetryConnectionState;
  readonly lastObservedAtMs: number | null;
};

export function useCollectionTelemetry(sessionId: string): CollectionTelemetryQuery {
  const port = useFlywheelPort();
  const load = useCallback(
    () => port.getCollectionTelemetry(sessionId),
    [port, sessionId],
  );
  const subscribe = useCallback((listener: () => void) => (
    port.subscribeCollectionTelemetry?.(sessionId, listener)
      ?? port.subscribe(listener)
  ), [port, sessionId]);
  const query = useAsyncQuery(load, subscribe, {
    queryKey: sessionId,
    retainPreviousData: true,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    const snapshot = query.status === 'ready' ? query.data : null;
    return {
      ...query,
      effectiveConnectionState: snapshot === null
        ? 'offline'
        : getEffectiveCollectionConnectionState(snapshot, nowMs, query.refreshError),
      lastObservedAtMs: snapshot?.observedAtMs ?? null,
    };
  }, [nowMs, query]);
}
