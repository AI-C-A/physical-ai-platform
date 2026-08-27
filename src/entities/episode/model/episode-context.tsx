import { createContext, useCallback, useContext } from 'react';

import { useAsyncQuery, type AsyncQueryState } from '@/shared/lib/async-query';
import type { PageResult } from '@/shared/lib/query';

import type { Episode } from './episode';
import type { EpisodeQuery, EpisodeRepositoryPort } from './episode-repository';

export const EpisodeRepositoryContext = createContext<EpisodeRepositoryPort | null>(null);

export function useEpisodeRepository(): EpisodeRepositoryPort {
  const repository = useContext(EpisodeRepositoryContext);
  if (repository === null) throw new Error('EpisodeRepositoryProvider가 필요합니다.');
  return repository;
}

export function useEpisodeQuery(query: EpisodeQuery): AsyncQueryState<PageResult<Episode>> {
  const repository = useEpisodeRepository();
  const load = useCallback(() => repository.queryEpisodes(query), [query, repository]);
  const subscribe = useCallback((listener: () => void) => repository.subscribe(listener), [repository]);
  return useAsyncQuery(load, subscribe, { retainPreviousData: true });
}

export function useEpisode(episodeId: string): AsyncQueryState<Episode | null> {
  const repository = useEpisodeRepository();
  const load = useCallback(() => repository.getEpisode(episodeId), [episodeId, repository]);
  const subscribe = useCallback((listener: () => void) => repository.subscribe(listener), [repository]);
  return useAsyncQuery(load, subscribe);
}
