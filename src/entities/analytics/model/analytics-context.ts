import { createContext, useContext } from 'react';

import type { AnalyticsPort } from './analytics';

export const AnalyticsContext = createContext<AnalyticsPort | null>(null);

export function useAnalyticsPort(): AnalyticsPort {
  const port = useContext(AnalyticsContext);
  if (port === null) throw new Error('AnalyticsProvider가 필요합니다.');
  return port;
}
