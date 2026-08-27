import type { CreateEpisodeInput, Episode } from './episode';
import type { PageRequest, PageResult } from '@/shared/lib/query';

export interface EpisodeQuery extends PageRequest {
  readonly search: string;
  readonly robotId: string | null;
  readonly environment: Episode['provenance']['environment'] | null;
  readonly deliveryMode: Episode['provenance']['deliveryMode'] | null;
  readonly sort: 'newest' | 'oldest' | 'bytes-desc' | 'duration-desc';
}

export interface EpisodeRepositoryPort {
  listEpisodes(): Promise<readonly Episode[]>;
  queryEpisodes(query: EpisodeQuery): Promise<PageResult<Episode>>;
  getEpisode(episodeId: string): Promise<Episode | null>;
  createEpisode(input: CreateEpisodeInput): Promise<Episode>;
  subscribe(listener: () => void): () => void;
}
