import { useCallback, useMemo } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';
import type { PageResult } from '@/shared/lib/query';

import type { RobotDescriptor } from './robot';
import { RobotCatalogAccessError, type RobotQuery } from './robot-catalog';
import { useRobotCatalogPort } from './robot-catalog-context';

async function loadRobotData<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error: unknown) {
    if (error instanceof RobotCatalogAccessError) throw error;
    throw new Error('로봇 목록을 불러오지 못했습니다.', { cause: error });
  }
}

type RobotCatalogLoadState =
  | {
      readonly status: 'loading';
      readonly robots: readonly [];
      readonly retry: () => void;
    }
  | {
      readonly status: 'ready';
      readonly robots: readonly RobotDescriptor[];
      readonly retry: () => void;
    }
  | {
      readonly status: 'error';
      readonly robots: readonly [];
      readonly message: string;
      readonly retry: () => void;
    };

type RobotLoadState = AsyncQueryState<RobotDescriptor | null>;

export function useRobot(robotId: string): RobotLoadState {
  const port = useRobotCatalogPort();
  const load = useCallback(
    () => loadRobotData(() => port.getRobot(robotId)),
    [port, robotId],
  );
  return useAsyncQuery(load);
}

export function useRobotCatalog(): RobotCatalogLoadState {
  const port = useRobotCatalogPort();
  const load = useCallback(() => loadRobotData(() => port.listRobots()), [port]);
  const result = useAsyncQuery(load);

  return useMemo(() => {
    if (result.status === 'ready') {
      return {
        status: 'ready',
        robots: result.data,
        retry: result.retry,
      };
    }
    if (result.status === 'error') {
      return {
        status: 'error',
        robots: [],
        message: result.message,
        retry: result.retry,
      };
    }
    return { status: 'loading', robots: [], retry: result.retry };
  }, [result]);
}

export function useRobotQuery(query: RobotQuery): AsyncQueryState<PageResult<RobotDescriptor>> {
  const port = useRobotCatalogPort();
  const load = useCallback(
    () => loadRobotData(() => port.queryRobots(query)),
    [port, query],
  );
  return useAsyncQuery(load, undefined, { retainPreviousData: true });
}
