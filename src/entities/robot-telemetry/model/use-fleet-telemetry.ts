import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { FleetTelemetryStore, type FleetTelemetrySnapshot } from './fleet-telemetry-store';
import { useRobotTelemetryPort } from './robot-telemetry-context';

export type FleetTelemetryView = FleetTelemetrySnapshot & {
  readonly retry: () => void;
};

function parseRobotIdSignature(signature: string): readonly string[] {
  const value: unknown = JSON.parse(signature);
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('내부 Robot 식별자 목록을 복원하지 못했습니다.');
  }
  return value;
}

export function useFleetTelemetry(robotIds: readonly string[]): FleetTelemetryView {
  const port = useRobotTelemetryPort();
  const robotIdSignature = JSON.stringify(
    [...new Set(robotIds)].sort((left, right) => left.localeCompare(right)),
  );
  const normalizedRobotIds = useMemo(
    () => parseRobotIdSignature(robotIdSignature),
    [robotIdSignature],
  );
  const store = useMemo(
    () => new FleetTelemetryStore(port, normalizedRobotIds),
    [normalizedRobotIds, port],
  );
  const [startSequence, setStartSequence] = useState(0);
  const retry = useCallback(() => setStartSequence((value) => value + 1), []);

  useEffect(() => {
    if (normalizedRobotIds.length === 0) return undefined;
    void store.start().catch(() => undefined);
    return () => store.stop();
  }, [normalizedRobotIds, startSequence, store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => ({ ...snapshot, retry }), [retry, snapshot]);
}
