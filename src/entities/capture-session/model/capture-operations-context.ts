import { createContext, useContext } from 'react';

import type { CaptureOperationsPort } from './capture-operations';

export const CaptureOperationsContext =
  createContext<CaptureOperationsPort | null>(null);

export function useCaptureOperationsPort(): CaptureOperationsPort {
  const port = useContext(CaptureOperationsContext);

  if (port === null) {
    throw new Error('CaptureOperationsPort가 구성되지 않았습니다.');
  }

  return port;
}
