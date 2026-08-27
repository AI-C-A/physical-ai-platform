import { createContext, useContext } from 'react';

import type { RobotOperationalStatusQueryPort } from './robot-operational-status';

export const RobotOperationalStatusContext =
  createContext<RobotOperationalStatusQueryPort | null>(null);

export function useRobotOperationalStatusPort(): RobotOperationalStatusQueryPort {
  const port = useContext(RobotOperationalStatusContext);
  if (port === null) {
    throw new Error('RobotOperationalStatusQueryPort가 구성되지 않았습니다.');
  }
  return port;
}
