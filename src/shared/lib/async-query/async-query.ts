import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type AsyncQuerySnapshot<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly message: string };

const skippedLoad = Symbol('skipped async query load');

export type AsyncQueryState<T> = AsyncQuerySnapshot<T> & {
  readonly isRefreshing: boolean;
  readonly refreshError: string | null;
  readonly retry: () => void;
};

interface AsyncQueryOptions {
  /** Query 조건 변경 중에도 마지막 성공 결과를 유지해 필터와 포커스를 보존한다. */
  readonly retainPreviousData?: boolean;
  /** 같은 load 함수로 조건만 바뀌는 경우 즉시 이전 결과를 stale 상태로 구분한다. */
  readonly queryKey?: unknown;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.';
}

export function useAsyncQuery<T>(
  load: () => Promise<T>,
  subscribe?: (listener: () => void) => () => void,
  options: AsyncQueryOptions = {},
): AsyncQueryState<T> {
  const queryKey = options.queryKey ?? load;
  const [result, setResult] = useState<{
    readonly queryKey: unknown;
    readonly snapshot: AsyncQuerySnapshot<T>;
  }>(() => ({ queryKey, snapshot: { status: 'loading' } }));
  const [retrySequence, setRetrySequence] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailure, setRefreshFailure] = useState<{
    readonly queryKey: unknown;
    readonly message: string;
  } | null>(null);
  const hasReadyData = useRef(false);
  const readyResult = useRef<{ readonly data: T } | null>(null);
  const readyQueryKey = useRef<unknown>(null);
  const retainPreviousData = options.retainPreviousData ?? false;
  const retry = useCallback(() => {
    setRetrySequence((sequence) => sequence + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let requestSequence = 0;
    let requestInFlight = false;
    let trailingRefreshRequested = false;
    const refresh = (showLoading: boolean): void => {
      if (requestInFlight) {
        trailingRefreshRequested = true;
        return;
      }

      requestInFlight = true;
      requestSequence += 1;
      const currentSequence = requestSequence;
      const sameReadyQuery = hasReadyData.current
        && Object.is(readyQueryKey.current, queryKey);
      const retainReadyResult = hasReadyData.current
        && (retainPreviousData || sameReadyQuery);
      if (showLoading && !retainReadyResult) {
        setResult({ queryKey, snapshot: { status: 'loading' } });
      }
      setRefreshFailure(null);
      setIsRefreshing(retainReadyResult || (!showLoading && hasReadyData.current));

      const continueWithTrailingRefresh = (): boolean => {
        if (!active || currentSequence !== requestSequence) return false;
        requestInFlight = false;
        if (!trailingRefreshRequested) return false;
        trailingRefreshRequested = false;
        refresh(false);
        return true;
      };

      void Promise.resolve().then<T | typeof skippedLoad>(() => {
        if (!active || currentSequence !== requestSequence) return skippedLoad;
        return load();
      }).then(
        (data) => {
          if (
            data !== skippedLoad
            && active
            && currentSequence === requestSequence
          ) {
            hasReadyData.current = true;
            readyResult.current = { data };
            readyQueryKey.current = queryKey;
            setResult({ queryKey, snapshot: { status: 'ready', data } });
            setRefreshFailure(null);
            if (!continueWithTrailingRefresh()) setIsRefreshing(false);
          }
        },
        (error: unknown) => {
          if (active && currentSequence === requestSequence) {
            if (continueWithTrailingRefresh()) return;
            const message = getErrorMessage(error);
            if (retainReadyResult && readyResult.current !== null) {
              setResult({
                queryKey,
                snapshot: { status: 'ready', data: readyResult.current.data },
              });
              setRefreshFailure({ queryKey, message });
            } else {
              hasReadyData.current = false;
              readyResult.current = null;
              setResult({
                queryKey,
                snapshot: { status: 'error', message },
              });
            }
            setIsRefreshing(false);
          }
        },
      );
    };
    refresh(true);
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribe?.(() => refresh(false));
    } catch (error: unknown) {
      active = false;
      requestSequence += 1;
      requestInFlight = false;
      trailingRefreshRequested = false;
      const message = getErrorMessage(error);
      const sameReadyQuery = hasReadyData.current
        && Object.is(readyQueryKey.current, queryKey);
      const retainReadyResult = hasReadyData.current
        && (retainPreviousData || sameReadyQuery)
        && readyResult.current !== null;
      if (retainReadyResult && readyResult.current !== null) {
        setResult({
          queryKey,
          snapshot: { status: 'ready', data: readyResult.current.data },
        });
        setRefreshFailure({ queryKey, message });
      } else {
        hasReadyData.current = false;
        readyResult.current = null;
        setResult({ queryKey, snapshot: { status: 'error', message } });
      }
      setIsRefreshing(false);
    }
    return () => {
      active = false;
      requestSequence += 1;
      trailingRefreshRequested = false;
      try {
        unsubscribe?.();
      } catch {
        // Adapter 해제 실패가 화면 이탈이나 다음 query 구독을 막지 않게 격리한다.
      }
    };
  }, [load, queryKey, retainPreviousData, retrySequence, subscribe]);

  return useMemo(
    () => {
      const queryMatchesResult = Object.is(result.queryKey, queryKey);
      const visibleSnapshot: AsyncQuerySnapshot<T> = queryMatchesResult
        ? result.snapshot
        : retainPreviousData && result.snapshot.status === 'ready'
          ? result.snapshot
          : { status: 'loading' };
      const visibleRefreshing = isRefreshing
        || (!queryMatchesResult && retainPreviousData && result.snapshot.status === 'ready');
      const refreshError = refreshFailure !== null
        && Object.is(refreshFailure.queryKey, queryKey)
        ? refreshFailure.message
        : null;
      return {
        ...visibleSnapshot,
        isRefreshing: visibleRefreshing,
        refreshError,
        retry,
      };
    },
    [isRefreshing, queryKey, refreshFailure, result, retainPreviousData, retry],
  );
}
