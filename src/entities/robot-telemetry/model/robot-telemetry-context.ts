import { createContext, useContext } from 'react';

import type { RobotTelemetryPort } from './robot-telemetry-port';

export const RobotTelemetryContext =
  createContext<RobotTelemetryPort | null>(null);

export function useRobotTelemetryPort(): RobotTelemetryPort {
  const port = useContext(RobotTelemetryContext);

  if (port === null) {
    throw new Error('RobotTelemetryPort가 구성되지 않았습니다.');
  }

  return port;
}
