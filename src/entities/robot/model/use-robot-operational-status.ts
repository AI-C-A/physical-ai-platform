import { useCallback, useMemo } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';

import { useRobotOperationalStatusPort } from './robot-operational-status-context';
import type { RobotOperationalStatus } from './robot-operational-status';

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
): AsyncQueryState<RobotOperationalStatus | null> {
  const port = useRobotOperationalStatusPort();
  const load = useCallback(
    () => loadOperationalStatus(() => port.getOperationalStatus(robotId)),
    [port, robotId],
  );
  return useAsyncQuery(load);
}

export function useRobotOperationalStatuses(
  robotIds: readonly string[],
): AsyncQueryState<Readonly<Record<string, RobotOperationalStatus | null>>> {
  const port = useRobotOperationalStatusPort();
  const signature = JSON.stringify([...new Set(robotIds)].sort());
  const normalizedIds = useMemo(() => {
    const value: unknown = JSON.parse(signature);
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error('Robot 운영 상태 식별자를 복원하지 못했습니다.');
    }
    return value;
  }, [signature]);
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
  return useAsyncQuery(load, undefined, { queryKey: signature });
}
