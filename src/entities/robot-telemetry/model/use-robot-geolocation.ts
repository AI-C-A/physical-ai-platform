import { useCallback } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';

import type { RobotGeolocationObservation } from './robot-telemetry';
import { useRobotGeolocationQueryPort } from './robot-geolocation-context';

export type RobotGeolocationLoadState = AsyncQueryState<
  RobotGeolocationObservation | null
>;

export function useRobotGeolocation(
  robotId: string | null,
): RobotGeolocationLoadState {
  const port = useRobotGeolocationQueryPort();
  const load = useCallback(
    () =>
      robotId === null
        ? Promise.resolve(null)
        : port.getGeolocationObservation(robotId),
    [port, robotId],
  );
  return useAsyncQuery(load);
}
