import { useCallback, useMemo, useState } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';

import { useRobotOperationalStatusPort } from './robot-operational-status-context';
import type {
  RobotOperationalStatus,
  RobotOperationalStatusStreamIssue,
  RobotOperationalStatusSubscriptionEvent,
} from './robot-operational-status';

type RobotOperationalStatusStreamStatus =
  | 'connecting'
  | 'online'
  | 'stale'
  | 'unavailable';

type RobotOperationalStatusQueryState<T> = AsyncQueryState<T> & {
  readonly streamIssue: RobotOperationalStatusStreamIssue | null;
  readonly streamIssuesByRobotId: Readonly<Record<string, RobotOperationalStatusStreamIssue>>;
  readonly streamStatus: RobotOperationalStatusStreamStatus;
};

interface RobotStreamState {
  readonly issue: RobotOperationalStatusStreamIssue | null;
  readonly robotId: string;
  readonly status: 'online' | 'stale';
}

interface RobotStreamCollectionState {
  readonly failures: ReadonlyMap<string, RobotOperationalStatusStreamIssue>;
  readonly onlineRobotIds: ReadonlySet<string>;
  readonly signature: string;
}

async function loadOperationalStatus(
  load: () => Promise<RobotOperationalStatus | null>,
): Promise<RobotOperationalStatus | null> {
  try {
    return await load();
  } catch (error: unknown) {
    throw new Error('로봇 정보를 불러오지 못했습니다.', { cause: error });
  }
}

export function useRobotOperationalStatus(
  robotId: string,
): RobotOperationalStatusQueryState<RobotOperationalStatus | null> {
  const port = useRobotOperationalStatusPort();
  const streamSupported = port.subscribeOperationalStatuses !== undefined;
  const [streamState, setStreamState] = useState<RobotStreamState | null>(null);
  const load = useCallback(
    () => loadOperationalStatus(() => port.getOperationalStatus(robotId)),
    [port, robotId],
  );
  const subscribe = useCallback(
    (invalidate: () => void) => {
      if (port.subscribeOperationalStatuses === undefined) return () => undefined;
      return port.subscribeOperationalStatuses([robotId], (event) => {
        if (event.robotId !== robotId) return;
        if (event.kind === 'updated') {
          setStreamState({ issue: null, robotId, status: 'online' });
          invalidate();
          return;
        }
        setStreamState({
          issue: {
            lastSuccessfulAtMs: event.lastSuccessfulAtMs,
            message: event.message,
            reason: event.reason,
          },
          robotId,
          status: 'stale',
        });
      });
    },
    [port, robotId],
  );
  const result = useAsyncQuery(load, subscribe);
  const visibleStreamState = streamState?.robotId === robotId ? streamState : null;
  const streamStatus = streamSupported
    ? visibleStreamState?.status ?? 'connecting'
    : 'unavailable';
  const visibleStreamIssue = visibleStreamState?.status === 'stale'
    ? visibleStreamState.issue
    : null;
  const streamIssuesByRobotId = useMemo(
    () => visibleStreamIssue === null ? {} : { [robotId]: visibleStreamIssue },
    [robotId, visibleStreamIssue],
  );
  const queryRetry = result.retry;
  const retry = useCallback(() => {
    if (streamSupported) setStreamState(null);
    queryRetry();
  }, [queryRetry, streamSupported]);

  return useMemo(() => ({
    ...result,
    refreshError: visibleStreamIssue?.message ?? result.refreshError,
    retry,
    streamIssue: visibleStreamIssue,
    streamIssuesByRobotId,
    streamStatus,
  }), [result, retry, streamIssuesByRobotId, streamStatus, visibleStreamIssue]);
}

export function useRobotOperationalStatuses(
  robotIds: readonly string[],
): RobotOperationalStatusQueryState<Readonly<Record<string, RobotOperationalStatus | null>>> {
  const port = useRobotOperationalStatusPort();
  const streamSupported = port.subscribeOperationalStatuses !== undefined;
  const signature = JSON.stringify([...new Set(robotIds)].sort());
  const [streamState, setStreamState] = useState<RobotStreamCollectionState | null>(null);
  const normalizedIds = useMemo(() => {
    const value: unknown = JSON.parse(signature);
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error('Robot 운영 상태 식별자를 복원하지 못했습니다.');
    }
    return value;
  }, [signature]);
  const normalizedIdSet = useMemo(() => new Set(normalizedIds), [normalizedIds]);
  const load = useCallback(async () => {
    try {
      const entries = await Promise.all(normalizedIds.map(async (robotId) => [
        robotId,
        await port.getOperationalStatus(robotId),
      ] as const));
      return Object.fromEntries(entries);
    } catch (error: unknown) {
      throw new Error('로봇 상태를 불러오지 못했습니다.', { cause: error });
    }
  }, [normalizedIds, port]);
  const subscribe = useCallback(
    (invalidate: () => void) => {
      if (port.subscribeOperationalStatuses === undefined) return () => undefined;
      return port.subscribeOperationalStatuses(
        normalizedIds,
        (event: RobotOperationalStatusSubscriptionEvent) => {
          if (!normalizedIdSet.has(event.robotId)) return;
          setStreamState((current) => {
            const failures = new Map(
              current?.signature === signature ? current.failures : [],
            );
            const onlineRobotIds = new Set(
              current?.signature === signature ? current.onlineRobotIds : [],
            );
            if (event.kind === 'updated') {
              failures.delete(event.robotId);
              onlineRobotIds.add(event.robotId);
            } else {
              failures.set(event.robotId, {
                lastSuccessfulAtMs: event.lastSuccessfulAtMs,
                message: event.message,
                reason: event.reason,
              });
              onlineRobotIds.delete(event.robotId);
            }
            return { failures, onlineRobotIds, signature };
          });
          if (event.kind === 'updated') invalidate();
        },
      );
    },
    [normalizedIdSet, normalizedIds, port, signature],
  );
  const result = useAsyncQuery(load, subscribe, { queryKey: signature });
  const visibleStreamState = streamState?.signature === signature ? streamState : null;
  const visibleStreamIssue = useMemo(() => {
    if (visibleStreamState === null) return null;
    for (const issue of visibleStreamState.failures.values()) {
      if (issue.reason === 'gateway-unreachable') return issue;
    }
    for (const robotId of normalizedIds) {
      const issue = visibleStreamState.failures.get(robotId);
      if (issue !== undefined) return issue;
    }
    return null;
  }, [normalizedIds, visibleStreamState]);
  const streamIssuesByRobotId = useMemo(
    () => visibleStreamState === null
      ? {}
      : Object.fromEntries(visibleStreamState.failures),
    [visibleStreamState],
  );
  const streamStatus: RobotOperationalStatusStreamStatus = !streamSupported
    || normalizedIds.length === 0
    ? 'unavailable'
    : visibleStreamState === null
      ? 'connecting'
      : visibleStreamState.failures.size > 0
        ? 'stale'
        : normalizedIds.every((robotId) => visibleStreamState.onlineRobotIds.has(robotId))
          ? 'online'
          : 'connecting';
  const queryRetry = result.retry;
  const retry = useCallback(() => {
    if (streamSupported) setStreamState(null);
    queryRetry();
  }, [queryRetry, streamSupported]);

  return useMemo(() => ({
    ...result,
    refreshError: visibleStreamIssue?.message ?? result.refreshError,
    retry,
    streamIssue: visibleStreamIssue,
    streamIssuesByRobotId,
    streamStatus,
  }), [result, retry, streamIssuesByRobotId, streamStatus, visibleStreamIssue]);
}
