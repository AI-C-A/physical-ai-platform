import {
  createInMemoryCaptureSessions,
  InMemoryCaptureOperationsAdapter,
  type CaptureOperationsPort,
} from '@/entities/capture-session';
import { createInMemoryDatasetRepository, type DatasetRepositoryPort } from '@/entities/dataset';
import { createInMemoryEpisodeRepository, type EpisodeRepositoryPort } from '@/entities/episode';
import {
  createInMemoryRobotCatalogWithData,
  createInMemoryRobotOperationalStatusWithData,
  inMemoryRobotIds,
  inMemoryRobotLocations,
  type RobotCatalogPort,
  type RobotOperationalStatusQueryPort,
} from '@/entities/robot';
import { createInMemoryRobotEventRepository, type RobotEventRepositoryPort } from '@/entities/robot-event';
import {
  InMemoryRobotGeolocationQuery,
  InMemoryTelemetryAdapter,
  type RobotGeolocationQueryPort,
  type RobotTelemetryPort,
} from '@/entities/robot-telemetry';
import { InMemoryRobotVideoAdapter, type RobotVideoPort } from '@/entities/robot-video';
import {
  createInMemorySensorDeviceCatalogWithData,
  type SensorDeviceCatalogPort,
} from '@/entities/sensor-device';
import type { ClockPort } from '@/shared/lib/clock';
import { systemScheduler, type Scheduler } from '@/shared/lib/scheduler';

export interface InMemoryCoreAdapterBundle {
  readonly robotCatalog: RobotCatalogPort;
  readonly robotOperationalStatus: RobotOperationalStatusQueryPort;
  readonly sensorDeviceCatalog: SensorDeviceCatalogPort;
  readonly robotTelemetry: RobotTelemetryPort;
  readonly robotGeolocation: RobotGeolocationQueryPort;
  readonly robotVideo: RobotVideoPort;
  readonly captureOperations: CaptureOperationsPort;
  readonly datasetRepository: DatasetRepositoryPort;
  readonly episodeRepository: EpisodeRepositoryPort;
  readonly robotEventRepository: RobotEventRepositoryPort;
}

type InMemoryAdapterFactories = {
  readonly [K in keyof InMemoryCoreAdapterBundle]: () => InMemoryCoreAdapterBundle[K];
};

interface OwnedInMemoryAdapterFactories {
  readonly factories: InMemoryAdapterFactories;
  dispose(): void;
}

export function createInMemoryAdapterFactories(
  clock: ClockPort,
): OwnedInMemoryAdapterFactories {
  const scheduler: Scheduler = {
    ...systemScheduler,
    now: () => clock.nowMs(),
  };
  const disposers: (() => void)[] = [];
  const own = <T extends { dispose(): void }>(adapter: T): T => {
    disposers.push(() => adapter.dispose());
    return adapter;
  };

  return {
    factories: {
      robotCatalog: () => createInMemoryRobotCatalogWithData(),
      robotOperationalStatus: () => createInMemoryRobotOperationalStatusWithData(clock),
      sensorDeviceCatalog: () => createInMemorySensorDeviceCatalogWithData(),
      robotTelemetry: () => own(new InMemoryTelemetryAdapter(inMemoryRobotIds, {
        scheduler,
      })),
      robotGeolocation: () => new InMemoryRobotGeolocationQuery(
        clock,
        inMemoryRobotLocations,
      ),
      robotVideo: () => own(new InMemoryRobotVideoAdapter(inMemoryRobotIds)),
      captureOperations: () => own(new InMemoryCaptureOperationsAdapter({
        initialSessions: createInMemoryCaptureSessions(clock),
        scheduler,
      })),
      datasetRepository: () => createInMemoryDatasetRepository(clock),
      episodeRepository: () => createInMemoryEpisodeRepository(clock),
      robotEventRepository: () => createInMemoryRobotEventRepository(clock),
    },
    dispose: () => {
      disposers.splice(0).reverse().forEach((dispose) => dispose());
    },
  };
}
