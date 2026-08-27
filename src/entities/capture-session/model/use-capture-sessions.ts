import { useCallback } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';

import { useCaptureOperationsPort } from './capture-operations-context';
import type { CaptureSession } from './capture-session';

export function useCaptureSessions(): AsyncQueryState<readonly CaptureSession[]> {
  const port = useCaptureOperationsPort();
  const load = useCallback(() => port.listSessions(), [port]);
  const subscribe = useCallback((listener: () => void) => port.subscribeSessions(listener), [port]);
  return useAsyncQuery(load, subscribe);
}

export function useCaptureSession(sessionId: string): AsyncQueryState<CaptureSession | null> {
  const port = useCaptureOperationsPort();
  const load = useCallback(() => port.getSession(sessionId), [port, sessionId]);
  const subscribe = useCallback((listener: () => void) => port.subscribeSessions(listener), [port]);
  return useAsyncQuery(load, subscribe);
}
