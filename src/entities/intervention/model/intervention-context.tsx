import { createContext, useCallback, useContext } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';

import type { InterventionRequest } from './intervention';
import type { InterventionQueuePort } from './intervention-queue';

export const InterventionQueueContext =
  createContext<InterventionQueuePort | null>(null);

export function useInterventionQueue(): InterventionQueuePort {
  const queue = useContext(InterventionQueueContext);
  if (queue === null) throw new Error('InterventionQueueProvider가 필요합니다.');
  return queue;
}

export function useActiveInterventionRequests(): AsyncQueryState<
  readonly InterventionRequest[]
> {
  const queue = useInterventionQueue();
  const load = useCallback(() => queue.listActiveRequests(), [queue]);
  const subscribe = useCallback(
    (listener: () => void) => queue.subscribe(listener),
    [queue],
  );
  return useAsyncQuery(load, subscribe, { retainPreviousData: true });
}

export function useInterventionRequest(
  interventionId: string | null,
): AsyncQueryState<InterventionRequest | null> {
  const queue = useInterventionQueue();
  const load = useCallback(
    () => interventionId === null
      ? Promise.resolve(null)
      : queue.getRequest(interventionId),
    [interventionId, queue],
  );
  const subscribe = useCallback(
    (listener: () => void) => interventionId === null
      ? () => undefined
      : queue.subscribe(listener),
    [interventionId, queue],
  );
  return useAsyncQuery(load, subscribe, { queryKey: interventionId });
}
