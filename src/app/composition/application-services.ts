import type { AnalyticsPort } from '@/entities/analytics';
import type { CaptureOperationsPort } from '@/entities/capture-session';
import type { DatasetRepositoryPort } from '@/entities/dataset';
import type { EpisodeRepositoryPort } from '@/entities/episode';
import {
  createUnconfiguredPatrolApiStatus,
  type PatrolApiStatusPort,
  type RobotCatalogPort,
  type RobotOperationalStatusQueryPort,
} from '@/entities/robot';
import type { RobotEventRepositoryPort } from '@/entities/robot-event';
import {
  type RobotGeolocationQueryPort,
  type RobotTelemetryPort,
} from '@/entities/robot-telemetry';
import type { RobotVideoPort } from '@/entities/robot-video';
import type { SensorDeviceCatalogPort } from '@/entities/sensor-device';
import type { RuntimeConfig } from '@/shared/config';
import { systemClock, type ClockPort } from '@/shared/lib/clock';

import { InMemoryAnalyticsAdapter } from './in-memory-analytics-adapter';
import {
  createInMemoryAdapterFactories,
  type InMemoryCoreAdapterBundle,
} from './in-memory-adapter-factories';
import { AvailableStreamCaptureOperations } from './available-stream-capture-operations';

export interface ApplicationServices {
  readonly clock: ClockPort;
  readonly patrolApiStatus: PatrolApiStatusPort;
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
  readonly analytics: AnalyticsPort;
  /** Composition이 소유한 app scope 구독과 선택 Adapter bundle의 자원을 멱등적으로 해제한다. */
  dispose(): void;
}

type AdapterBundle = Omit<ApplicationServices, 'clock' | 'dispose'>;

type ExternalAdapterBundle = AdapterBundle & {
  dispose?(): void;
};

export type ExternalAdapterFactory = (
  runtimeConfig: RuntimeConfig,
  clock: ClockPort,
) => ExternalAdapterBundle;

interface CreateApplicationServicesOptions {
  readonly clock?: ClockPort;
  readonly externalAdapterFactory?: ExternalAdapterFactory;
}

type CoreAdapterBundle = InMemoryCoreAdapterBundle;

const adapterServiceNames = [
  'robotCatalog',
  'patrolApiStatus',
  'robotOperationalStatus',
  'sensorDeviceCatalog',
  'robotTelemetry',
  'robotGeolocation',
  'robotVideo',
  'captureOperations',
  'datasetRepository',
  'episodeRepository',
  'robotEventRepository',
  'analytics',
] as const satisfies readonly (keyof AdapterBundle)[];

function assertCompleteExternalBundle(
  bundle: ExternalAdapterBundle | null | undefined,
): asserts bundle is ExternalAdapterBundle {
  if (bundle === null || bundle === undefined) {
    throw new Error('external Adapter를 만들지 못했습니다. subsystem: robotCatalog');
  }
  const missingService = adapterServiceNames.find(
    (serviceName) => bundle[serviceName] === undefined,
  );
  if (missingService !== undefined) {
    throw new Error(
      `external Adapter를 만들지 못했습니다. subsystem: ${String(missingService)}`,
    );
  }
}

async function synchronizeCompletedSessions(
  capture: CaptureOperationsPort,
  episodes: EpisodeRepositoryPort,
  isActive: () => boolean,
): Promise<void> {
  const [sessions, existingEpisodes] = await Promise.all([
    capture.listSessions(),
    episodes.listEpisodes(),
  ]);
  if (!isActive()) return;
  const sourceSessionIds = new Set(existingEpisodes.map((episode) => episode.captureSessionId));
  for (const session of sessions) {
    if (!isActive()) return;
    if (session.status !== 'completed' || sourceSessionIds.has(session.id)) continue;
    if (
      session.startedAtMs === null
      || session.stoppedAtMs === null
      || session.completedAtMs === null
      || session.stoppedAtMs < session.startedAtMs
      || session.completedAtMs < session.stoppedAtMs
    ) {
      throw new Error(
        `완료된 수집 세션의 시간 정보가 올바르지 않아 에피소드를 만들지 않았습니다: ${session.id}`,
      );
    }
    const input = {
      name: `${session.name} 에피소드`,
      captureSessionId: session.id,
      robotId: session.robotId,
      sensorDeviceId: session.sensorDeviceId,
      integrationProfileId: session.integrationProfileId,
      provenance: session.provenance,
      createdAtMs: session.completedAtMs,
      durationMs: session.stoppedAtMs - session.startedAtMs,
      bytesWritten: session.bytesWritten,
      streams: session.streams.map((stream) => ({
        id: stream.id,
        displayName: stream.displayName,
        bytesWritten: stream.bytesWritten,
        observedRateHz: stream.observedRateHz,
      })),
    };
    if (!isActive()) return;
    await episodes.createEpisode(session.episodeId === null ? input : { ...input, id: session.episodeId });
    sourceSessionIds.add(session.id);
  }
}

interface CompletedSessionSynchronization {
  dispose(): void;
  request(): void;
}

/**
 * 완료 Session invalidation을 직렬 처리하고 이미 만든 Episode를 다시 만들지 않는다.
 * dispose 이후 늦게 끝난 조회도 새 쓰기 작업을 시작해서는 안 된다.
 */
function createCompletedSessionSynchronization(
  capture: CaptureOperationsPort,
  episodes: EpisodeRepositoryPort,
): CompletedSessionSynchronization {
  let disposed = false;
  let requested = false;
  let running = false;
  const isActive = (): boolean => !disposed;

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;

    try {
      do {
        requested = false;
        if (disposed) return;
        await synchronizeCompletedSessions(capture, episodes, isActive);
      } while (requested && !disposed);
    } finally {
      running = false;
    }
  };

  const request = (): void => {
    if (disposed) return;
    requested = true;
    void run().catch(() => undefined);
  };
  const unsubscribe = capture.subscribeSessions(request);
  request();

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    },
    request,
  };
}

/** Runtime Config가 선택한 구현을 자동 fallback 없이 조립하고 Page에는 Port만 노출한다. */
export function createApplicationServices(
  runtimeConfig: RuntimeConfig,
  options: CreateApplicationServicesOptions = {},
): ApplicationServices {
  const clock = options.clock ?? systemClock;
  if (runtimeConfig.adapters.implementation === 'external') {
    if (options.externalAdapterFactory === undefined) {
      throw new Error(
        'external Adapter factory가 등록되지 않았습니다. subsystem: robotCatalog',
      );
    }
    const externalBundle = options.externalAdapterFactory(runtimeConfig, clock);
    try {
      assertCompleteExternalBundle(externalBundle);
    } catch (error: unknown) {
      externalBundle?.dispose?.();
      throw error;
    }
    let disposed = false;
    return {
      clock,
      ...externalBundle,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        externalBundle.dispose?.();
      },
    };
  }

  const inMemoryAdapters = createInMemoryAdapterFactories(clock);
  try {
    const robotCatalog = inMemoryAdapters.factories.robotCatalog();
    const robotOperationalStatus =
      inMemoryAdapters.factories.robotOperationalStatus();
    const sensorDeviceCatalog =
      inMemoryAdapters.factories.sensorDeviceCatalog();
    const robotTelemetry = inMemoryAdapters.factories.robotTelemetry();
    const robotGeolocation = inMemoryAdapters.factories.robotGeolocation();
    const robotVideo = inMemoryAdapters.factories.robotVideo();
    const selectedCaptureOperations =
      inMemoryAdapters.factories.captureOperations();
    const captureOperations = new AvailableStreamCaptureOperations(
      selectedCaptureOperations,
      robotOperationalStatus,
      robotTelemetry,
      robotVideo,
    );
    const robotEventRepository =
      inMemoryAdapters.factories.robotEventRepository();
    const episodeRepository = inMemoryAdapters.factories.episodeRepository();
    const datasetRepository = inMemoryAdapters.factories.datasetRepository();
    const core: CoreAdapterBundle = {
      robotCatalog,
      robotOperationalStatus,
      sensorDeviceCatalog,
      robotTelemetry,
      robotGeolocation,
      robotVideo,
      captureOperations,
      robotEventRepository,
      episodeRepository,
      datasetRepository,
    };
    const analytics = new InMemoryAnalyticsAdapter({
      capture: core.captureOperations,
      episodes: core.episodeRepository,
      datasets: core.datasetRepository,
    });
    const completedSessionSynchronization =
      createCompletedSessionSynchronization(
        core.captureOperations,
        core.episodeRepository,
      );

    let disposed = false;
    return {
      clock,
      patrolApiStatus: createUnconfiguredPatrolApiStatus(),
      ...core,
      analytics,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        completedSessionSynchronization.dispose();
        inMemoryAdapters.dispose();
      },
    };
  } catch (error: unknown) {
    inMemoryAdapters.dispose();
    throw error;
  }
}
