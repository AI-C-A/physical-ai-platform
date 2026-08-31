import type { AnalyticsPort } from '@/entities/analytics';
import type { CaptureOperationsPort } from '@/entities/capture-session';
import type { DatasetRepositoryPort } from '@/entities/dataset';
import type { EpisodeRepositoryPort } from '@/entities/episode';
import {
  createUnavailableInterventionQueue,
  type InterventionQueuePort,
} from '@/entities/intervention';
import type { RobotEventRepositoryPort } from '@/entities/robot-event';
import type {
  RobotGeolocationQueryPort,
  RobotTelemetryPort,
} from '@/entities/robot-telemetry';
import type { SensorDeviceCatalogPort } from '@/entities/sensor-device';
import { createPageResult } from '@/shared/lib/query';

const noOpUnsubscribe = (): void => undefined;
const unavailableMessage = '이 실행 환경에서는 지원하지 않는 작업입니다.';

interface PatrolNoDataAdapters {
  readonly sensorDeviceCatalog: SensorDeviceCatalogPort;
  readonly robotTelemetry: RobotTelemetryPort;
  readonly robotGeolocation: RobotGeolocationQueryPort;
  readonly captureOperations: CaptureOperationsPort;
  readonly robotEventRepository: RobotEventRepositoryPort;
  readonly episodeRepository: EpisodeRepositoryPort;
  readonly interventionQueue: InterventionQueuePort;
  readonly datasetRepository: DatasetRepositoryPort;
  readonly analytics: AnalyticsPort;
}

/**
 * external bundle에서 source가 없는 조회는 Empty 또는 Disconnected로 표현한다.
 * command transport가 없는 쓰기 작업은 거절하며 in-memory 값으로 대체하지 않는다.
 */
export function createPatrolNoDataAdapters(): PatrolNoDataAdapters {
  const sensorDeviceCatalog: SensorDeviceCatalogPort = {
    listSensorDevices: () => Promise.resolve([]),
    getSensorDevice: () => Promise.resolve(null),
  };
  const robotTelemetry: RobotTelemetryPort = {
    getChannelDescriptors: () => Promise.resolve([]),
    getExecutionSource: () => Promise.resolve({
      environment: 'physical',
      deliveryMode: 'live',
    }),
    connect: () => Promise.resolve(),
    subscribe: () => noOpUnsubscribe,
    subscribeConnection: (listener) => {
      listener('disconnected');
      return noOpUnsubscribe;
    },
    disconnect: () => undefined,
  };
  const robotGeolocation: RobotGeolocationQueryPort = {
    getGeolocationObservation: () => Promise.resolve(null),
  };
  const captureOperations: CaptureOperationsPort = {
    listSessions: () => Promise.resolve([]),
    querySessions: (query) => Promise.resolve(createPageResult([], query)),
    getSession: () => Promise.resolve(null),
    getPlanOptions: () => Promise.resolve({
      streams: [],
      environments: [],
      deliveryModes: [],
      dataOrigins: [],
      controlModes: [],
    }),
    createSession: () => Promise.reject(new Error(unavailableMessage)),
    validateSession: () => Promise.reject(new Error(unavailableMessage)),
    startSession: () => Promise.reject(new Error(unavailableMessage)),
    stopSession: () => Promise.reject(new Error(unavailableMessage)),
    subscribeSession: () => noOpUnsubscribe,
    subscribeSessions: () => noOpUnsubscribe,
  };
  const robotEventRepository: RobotEventRepositoryPort = {
    listEvents: () => Promise.resolve([]),
    queryEvents: (query) => Promise.resolve(createPageResult([], query)),
    subscribe: () => noOpUnsubscribe,
  };
  const episodeRepository: EpisodeRepositoryPort = {
    listEpisodes: () => Promise.resolve([]),
    queryEpisodes: (query) => Promise.resolve(createPageResult([], query)),
    getEpisode: () => Promise.resolve(null),
    createEpisode: () => Promise.reject(new Error(unavailableMessage)),
    subscribe: () => noOpUnsubscribe,
  };
  const datasetRepository: DatasetRepositoryPort = {
    listDatasets: () => Promise.resolve([]),
    queryDatasets: (query) => Promise.resolve(createPageResult([], query)),
    getDataset: () => Promise.resolve(null),
    createDataset: () => Promise.reject(new Error(unavailableMessage)),
    updateDataset: () => Promise.reject(new Error(unavailableMessage)),
    subscribe: () => noOpUnsubscribe,
  };
  const analytics: AnalyticsPort = {
    getOverview: () => Promise.resolve({
      sessionCount: 0,
      successRatePercent: null,
      bytesWritten: 0,
      episodeCount: 0,
      datasetCount: 0,
      statusSeries: [],
      trendSeries: [],
    }),
    queryOperations: () => Promise.resolve({ records: [], groups: [] }),
    queryTelemetry: () => Promise.resolve({
      bucketMs: 0,
      displayedPointCount: 0,
      points: [],
    }),
    subscribe: () => noOpUnsubscribe,
  };

  const interventionQueue = createUnavailableInterventionQueue();

  return {
    sensorDeviceCatalog,
    robotTelemetry,
    robotGeolocation,
    captureOperations,
    robotEventRepository,
    episodeRepository,
    interventionQueue,
    datasetRepository,
    analytics,
  };
}
