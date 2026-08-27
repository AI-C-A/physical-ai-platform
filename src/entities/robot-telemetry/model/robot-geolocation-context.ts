import { createContext, useContext } from 'react';

import type { RobotGeolocationQueryPort } from './robot-geolocation-query-port';

export const RobotGeolocationContext =
  createContext<RobotGeolocationQueryPort | null>(null);

export function useRobotGeolocationQueryPort(): RobotGeolocationQueryPort {
  const port = useContext(RobotGeolocationContext);

  if (port === null) {
    throw new Error('RobotGeolocationQueryPort가 구성되지 않았습니다.');
  }

  return port;
}
