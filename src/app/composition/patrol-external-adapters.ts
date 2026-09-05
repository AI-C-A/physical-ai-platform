import {
  PatrolRobotCatalogAdapter,
  PatrolRobotOperationalStatusQuery,
} from '@/entities/robot';
import { PatrolRobotEventRepository } from '@/entities/robot-event';
import { KinesisCameraAdapter } from '@/entities/robot-video';

import type { ExternalAdapterFactory } from './application-services';
import { createPatrolNoDataAdapters } from './patrol-no-data-adapters';

export const createPatrolExternalAdapters: ExternalAdapterFactory = (
  runtimeConfig,
  clock,
) => {
  const endpoint = runtimeConfig.connections.patrol.endpoint;
  if (endpoint === null) {
    throw new Error('Patrol external Adapter에는 connections.patrol.endpoint가 필요합니다.');
  }
  const robotCatalog = new PatrolRobotCatalogAdapter({ endpoint });
  const video = new KinesisCameraAdapter({ endpoint });
  const noData = createPatrolNoDataAdapters();
  return {
    patrolApiStatus: robotCatalog,
    robotCatalog,
    robotOperationalStatus: new PatrolRobotOperationalStatusQuery({
      endpoint,
      clock,
    }),
    robotVideo: video,
    sensorDeviceCatalog: noData.sensorDeviceCatalog,
    robotTelemetry: noData.robotTelemetry,
    robotGeolocation: noData.robotGeolocation,
    captureOperations: noData.captureOperations,
    robotEventRepository: new PatrolRobotEventRepository({ endpoint }),
    episodeRepository: noData.episodeRepository,
    flywheel: noData.flywheel,
    questCollector: noData.questCollector,
    interventionQueue: noData.interventionQueue,
    datasetRepository: noData.datasetRepository,
    analytics: noData.analytics,
    dispose: () => {
      video.dispose();
      noData.questCollector.leaveCollector();
    },
  };
};
