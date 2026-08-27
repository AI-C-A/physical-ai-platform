import { createContext, useContext } from 'react';

import type { RobotCatalogPort } from './robot-catalog';

export const RobotCatalogContext = createContext<RobotCatalogPort | null>(null);

export function useRobotCatalogPort(): RobotCatalogPort {
  const port = useContext(RobotCatalogContext);

  if (port === null) {
    throw new Error('RobotCatalogPort가 구성되지 않았습니다.');
  }

  return port;
}
