import { createContext, useContext } from 'react';

import type { ClockPort } from './clock';

export const ClockContext = createContext<ClockPort | null>(null);

export function useClock(): ClockPort {
  const clock = useContext(ClockContext);
  if (clock === null) {
    throw new Error('ClockPort가 Composition Root에 등록되지 않았습니다.');
  }
  return clock;
}
