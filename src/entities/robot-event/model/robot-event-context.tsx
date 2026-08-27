import { createContext, useContext } from 'react';

import type { RobotEventRepositoryPort } from './robot-event-repository';

export const RobotEventRepositoryContext = createContext<RobotEventRepositoryPort | null>(null);

export function useRobotEventRepository(): RobotEventRepositoryPort {
  const repository = useContext(RobotEventRepositoryContext);
  if (repository === null) throw new Error('RobotEventRepositoryProvider가 필요합니다.');
  return repository;
}
