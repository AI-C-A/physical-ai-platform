import { createContext, useContext } from 'react';

import type { RobotVideoPort } from './robot-video';

export const RobotVideoContext = createContext<RobotVideoPort | null>(null);

export function useRobotVideoPort(): RobotVideoPort {
  const port = useContext(RobotVideoContext);
  if (port === null) throw new Error('RobotVideoProvider가 필요합니다.');
  return port;
}
