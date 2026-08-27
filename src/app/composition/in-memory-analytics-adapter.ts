import type {
  AnalyticsOperationQuery,
  AnalyticsOperationResult,
  AnalyticsOverview,
  AnalyticsPort,
  AnalyticsRange,
  AnalyticsRecord,
  TelemetryAggregateQuery,
  TelemetryAggregateResult,
} from '@/entities/analytics';
import type { CaptureOperationsPort } from '@/entities/capture-session';
import type { DatasetRepositoryPort } from '@/entities/dataset';
import type { EpisodeRepositoryPort } from '@/entities/episode';

interface InMemoryAnalyticsDependencies {
  readonly capture: CaptureOperationsPort;
  readonly episodes: EpisodeRepositoryPort;
  readonly datasets: DatasetRepositoryPort;
}

const dayMs = 86_400_000;

function isInRange(timestampMs: number, query: AnalyticsRange): boolean {
  return timestampMs >= query.startMs && timestampMs <= query.endMs;
}

export class InMemoryAnalyticsAdapter implements AnalyticsPort {
  readonly #dependencies: InMemoryAnalyticsDependencies;

  constructor(dependencies: InMemoryAnalyticsDependencies) {
    this.#dependencies = dependencies;
  }

  async getOverview(query: AnalyticsRange): Promise<AnalyticsOverview> {
    const [allSessions, allEpisodes, allDatasets] = await Promise.all([
      this.#dependencies.capture.listSessions(),
      this.#dependencies.episodes.listEpisodes(),
      this.#dependencies.datasets.listDatasets(),
    ]);
    const sessions = allSessions.filter(
      (session) =>
        isInRange(session.createdAtMs, query) &&
        (query.robotId === null || session.robotId === query.robotId),
    );
    const episodes = allEpisodes.filter(
      (episode) =>
        isInRange(episode.createdAtMs, query) &&
        (query.robotId === null || episode.robotId === query.robotId),
    );
    const episodeRobotById = new Map(
      allEpisodes.map((episode) => [episode.id, episode.robotId]),
    );
    const datasets = allDatasets.filter(
      (dataset) =>
        isInRange(dataset.updatedAtMs, query)
        && (
          query.robotId === null
          || dataset.episodeIds.some(
            (episodeId) => episodeRobotById.get(episodeId) === query.robotId,
          )
        ),
    );
    const completedCount = sessions.filter(
      (session) => session.status === 'completed',
    ).length;
    const statuses = [
      'draft',
      'validating',
      'ready',
      'starting',
      'recording',
      'stopping',
      'finalizing',
      'processing',
      'completed',
      'failed',
      'interrupted',
    ] as const;
    const bucketCount = Math.min(30, Math.max(1, Math.ceil((query.endMs - query.startMs) / dayMs)));
    const bucketMs = Math.max(1, Math.ceil((query.endMs - query.startMs) / bucketCount));

    return {
      sessionCount: sessions.length,
      successRatePercent: sessions.length === 0
        ? null
        : (completedCount / sessions.length) * 100,
      bytesWritten: sessions.reduce((total, session) => total + session.bytesWritten, 0),
      episodeCount: episodes.length,
      datasetCount: datasets.length,
      statusSeries: statuses
        .map((status) => ({
          label: status,
          value: sessions.filter((session) => session.status === status).length,
        }))
        .filter((item) => item.value > 0),
      trendSeries: Array.from({ length: bucketCount }, (_, index) => {
        const startMs = query.startMs + index * bucketMs;
        const endMs = index === bucketCount - 1
          ? query.endMs + 1
          : Math.min(query.endMs + 1, startMs + bucketMs);
        return {
          label: new Date(startMs).toLocaleDateString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
          }),
          value: sessions.filter(
            (session) => session.createdAtMs >= startMs && session.createdAtMs < endMs,
          ).length,
        };
      }),
    };
  }

  async queryOperations(query: AnalyticsOperationQuery): Promise<AnalyticsOperationResult> {
    const [sessions, episodes, datasets] = await Promise.all([
      this.#dependencies.capture.listSessions(),
      this.#dependencies.episodes.listEpisodes(),
      this.#dependencies.datasets.listDatasets(),
    ]);
    const records: readonly AnalyticsRecord[] = query.type === 'session'
      ? sessions.map((session) => ({
          id: session.id,
          type: 'session' as const,
          name: session.name,
          status: session.status,
          robotId: session.robotId,
          timestampMs: session.createdAtMs,
          bytes: session.bytesWritten,
          provenance: session.provenance,
        }))
      : query.type === 'episode'
        ? episodes.map((episode) => ({
            id: episode.id,
            type: 'episode' as const,
            name: episode.name,
            status: 'completed',
            robotId: episode.robotId,
            timestampMs: episode.createdAtMs,
            bytes: episode.bytesWritten,
            provenance: episode.provenance,
          }))
        : datasets.map((dataset) => ({
            id: dataset.id,
            type: 'dataset' as const,
            name: dataset.name,
            status: dataset.status,
            robotId: null,
            timestampMs: dataset.updatedAtMs,
            bytes: null,
            provenance: null,
          }));
    const filtered = records.filter(
      (record) =>
        isInRange(record.timestampMs, query) &&
        (query.robotId === null || record.robotId === query.robotId) &&
        (query.status === null || record.status === query.status) &&
        (query.environment === null || record.provenance?.environment === query.environment) &&
        (query.deliveryMode === null || record.provenance?.deliveryMode === query.deliveryMode),
    );
    const groupMap = new Map<
      string | null,
      { count: number; knownBytes: number; hasUnknownBytes: boolean }
    >();
    if (query.groupBy !== 'none') {
      filtered.forEach((record) => {
        const key = query.groupBy === 'status' ? record.status : record.robotId;
        const current = groupMap.get(key) ?? {
          count: 0,
          knownBytes: 0,
          hasUnknownBytes: false,
        };
        groupMap.set(key, {
          count: current.count + 1,
          knownBytes: current.knownBytes + (record.bytes ?? 0),
          hasUnknownBytes: current.hasUnknownBytes || record.bytes === null,
        });
      });
    }
    return {
      records: [...filtered].sort((left, right) => {
        const primary = right.timestampMs - left.timestampMs;
        return primary === 0 ? left.id.localeCompare(right.id) : primary;
      }),
      groups: [...groupMap.entries()].map(([key, value]) => ({
        key,
        count: value.count,
        bytes: value.hasUnknownBytes ? null : value.knownBytes,
      })),
    };
  }

  queryTelemetry(query: TelemetryAggregateQuery): Promise<TelemetryAggregateResult> {
    const durationMs = Math.max(1, query.endMs - query.startMs);
    const bucketMs = Math.max(10_000, Math.ceil(durationMs / query.maxPoints / 10_000) * 10_000);
    const pointCount = Math.min(query.maxPoints, Math.max(1, Math.ceil(durationMs / bucketMs)));
    const robotNumber = Number(query.robotId.replace(/\D/g, '')) || 1;
    const points = Array.from({ length: pointCount }, (_, index) => {
      const timestampMs = query.startMs + index * bucketMs;
      const wave = Math.sin(index / 2 + robotNumber);
      const average = query.channel === 'battery'
        ? Math.max(0, 96 - index * 0.08 + wave * 0.3)
        : 1.5 + wave * 0.75;
      return {
        timestampMs,
        average,
        minimum: average - (query.channel === 'battery' ? 0.2 : 0.35),
        maximum: average + (query.channel === 'battery' ? 0.2 : 0.35),
        sampleCount: query.channel === 'battery' ? Math.max(1, Math.round(bucketMs / 1000)) : Math.max(1, Math.round(bucketMs / 50)),
      };
    });
    return Promise.resolve({ bucketMs, displayedPointCount: points.length, points });
  }

  subscribe(listener: () => void): () => void {
    const unsubscribers: Array<() => void> = [];
    const release = (): void => {
      unsubscribers.splice(0).reverse().forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // 한 Port의 잘못된 해제가 나머지 app scope 구독 정리를 막지 않는다.
        }
      });
    };

    try {
      unsubscribers.push(
        this.#dependencies.capture.subscribeSessions(listener),
      );
      unsubscribers.push(this.#dependencies.episodes.subscribe(listener));
      unsubscribers.push(this.#dependencies.datasets.subscribe(listener));
    } catch (error: unknown) {
      release();
      throw error;
    }

    return release;
  }
}
