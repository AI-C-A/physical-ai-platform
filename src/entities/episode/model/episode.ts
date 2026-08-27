import type { ExecutionProvenance } from '@/shared/domain';

export interface EpisodeStreamSummary {
  readonly id: string;
  readonly displayName: string;
  readonly bytesWritten: number;
  readonly observedRateHz: number | null;
}

export type EpisodeProvenance = ExecutionProvenance;

/** Capture 결과를 Dataset 구성 단위로 조회하기 위한 내부 표준 Episode다. */
export interface Episode {
  readonly id: string;
  readonly name: string;
  readonly captureSessionId: string;
  readonly robotId: string;
  readonly sensorDeviceId: string;
  readonly integrationProfileId: string;
  readonly provenance: EpisodeProvenance;
  readonly createdAtMs: number;
  readonly durationMs: number;
  readonly bytesWritten: number;
  readonly streams: readonly EpisodeStreamSummary[];
}

export type CreateEpisodeInput = Omit<Episode, 'id'> & { readonly id?: string };
