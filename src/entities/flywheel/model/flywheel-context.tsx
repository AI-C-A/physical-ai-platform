import { createContext, useCallback, useContext } from 'react';

import { useAsyncQuery } from '@/shared/lib/async-query';

import type { FlywheelPort } from './flywheel';

export const FlywheelContext = createContext<FlywheelPort | null>(null);

export function useFlywheelPort(): FlywheelPort {
  const port = useContext(FlywheelContext);
  if (port === null) throw new Error('FlywheelProvider가 필요합니다.');
  return port;
}

export function useFlywheelQuery<T>(load: (port: FlywheelPort) => Promise<T>) {
  const port = useFlywheelPort();
  const loader = useCallback(() => load(port), [load, port]);
  const subscribe = useCallback((listener: () => void) => port.subscribe(listener), [port]);
  return useAsyncQuery(loader, subscribe, { retainPreviousData: true });
}
