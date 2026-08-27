export {
  createInMemoryRobotCatalogWithData,
  createInMemoryRobotOperationalStatusWithData,
  inMemoryRobotIds,
  inMemoryRobotLocations,
} from './api/in-memory-robot-data';
export { InMemoryRobotOperationalStatusQuery } from './api/in-memory-robot-operational-status';
export {
  PatrolRobotCatalogAdapter,
  PatrolRobotOperationalStatusQuery,
} from './api/patrol-robot-adapters';
export {
  RobotCatalogContext,
  useRobotCatalogPort,
} from './model/robot-catalog-context';
export {
  RobotOperationalStatusContext,
  useRobotOperationalStatusPort,
} from './model/robot-operational-status-context';
export {
  useRobot,
  useRobotCatalog,
  useRobotQuery,
} from './model/use-robot-catalog';
export {
  useRobotOperationalStatus,
  useRobotOperationalStatuses,
} from './model/use-robot-operational-status';
export type { RobotCatalogPort, RobotQuery } from './model/robot-catalog';
export type {
  PatrolRobotSnapshot,
  RobotOperationalStatus,
  RobotOperationalStatusQueryPort,
} from './model/robot-operational-status';
export type { RobotDescriptor } from './model/robot';
export { RobotInfoTable } from './ui/RobotInfoTable';
