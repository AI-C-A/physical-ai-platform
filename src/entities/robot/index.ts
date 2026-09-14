import './ui/robot-map-label.css';

export {
  createInMemoryRobotCatalogWithData,
  createInMemoryRobotOperationalStatusWithData,
  inMemoryRobotIds,
  inMemoryRobotLocations,
} from './api/in-memory-robot-data';
export { createInMemoryRobotCatalog } from './api/in-memory-robot-catalog';
export { InMemoryRobotOperationalStatusQuery } from './api/in-memory-robot-operational-status';
export {
  PatrolRobotCatalogAdapter,
  PatrolRobotOperationalStatusQuery,
} from './api/patrol-robot-adapters';
export { createUnconfiguredPatrolApiStatus } from './api/unconfigured-patrol-api-status';
export {
  PatrolApiStatusContext,
  usePatrolApiStatusPort,
} from './model/patrol-api-status-context';
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
export { RobotCatalogAccessError } from './model/robot-catalog';
export { PatrolApiStatusCheckError } from './model/patrol-api-status';
export type { PatrolApiStatusPort } from './model/patrol-api-status';
export type {
  PatrolRobotSnapshot,
  RobotOperationalStatus,
  RobotOperationalStatusQueryPort,
  RobotOperationalStatusSubscriptionEvent,
} from './model/robot-operational-status';
export type { RobotDescriptor, RobotModelId, RobotType } from './model/robot';
export { RobotInfoOverview } from './ui/RobotInfoOverview';
export { RobotModelViewer } from './ui/RobotModelViewer';
export { RealtimeStatusNotice } from './ui/RealtimeStatusNotice';
export { RobotCompanyAvatar } from './ui/RobotCompanyAvatar';

export { defaultModels, robotModels } from './model/robot-models';
export { createCarouselScene } from './ui/robot-carousel-scene';
export { RobotSceneContext } from './ui/robot-scene-context';
export { RobotScenePreview } from './ui/RobotScenePreview';
