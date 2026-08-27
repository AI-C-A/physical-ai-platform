import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { RobotTelemetryStore, type RobotTelemetrySnapshot } from './robot-telemetry-store';
import { useRobotTelemetryPort } from './robot-telemetry-context';

export type RobotTelemetryView = RobotTelemetrySnapshot & {
  readonly retry: () => void;
};

export function useRobotTelemetry(robotId: string): RobotTelemetryView {
  const port = useRobotTelemetryPort();
  const store = useMemo(
    () => new RobotTelemetryStore(port, null),
    [port],
  );
  const [startSequence, setStartSequence] = useState(0);
  const retry = useCallback(() => setStartSequence((value) => value + 1), []);

  useEffect(() => {
    store.setRobotId(robotId);
    void store.start().catch(() => undefined);
    return () => store.stop();
  }, [robotId, startSequence, store]);

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return useMemo(() => ({ ...snapshot, retry }), [retry, snapshot]);
}
