import { createContext, useContext } from 'react';

import type { PatrolApiStatusPort } from './patrol-api-status';

export const PatrolApiStatusContext =
  createContext<PatrolApiStatusPort | null>(null);

export function usePatrolApiStatusPort(): PatrolApiStatusPort {
  const port = useContext(PatrolApiStatusContext);
  if (port === null) {
    throw new Error(
      'PatrolApiStatusPort가 Composition Root에 등록되지 않았습니다.',
    );
  }
  return port;
}
