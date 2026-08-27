import { createStore, type StoreApi } from 'zustand/vanilla';
import { createPageResult } from '@/shared/lib/query';

import type { CreateEpisodeInput, Episode } from '../model/episode';
import type { EpisodeQuery, EpisodeRepositoryPort } from '../model/episode-repository';

interface EpisodeState {
  readonly episodes: readonly Episode[];
}

export class InMemoryEpisodeRepository implements EpisodeRepositoryPort {
  readonly #store: StoreApi<EpisodeState>;
  #sequence = 100;

  constructor(initialEpisodes: readonly Episode[]) {
    this.#store = createStore(() => ({ episodes: initialEpisodes }));
  }

  listEpisodes(): Promise<readonly Episode[]> {
    return Promise.resolve(this.#episodes());
  }

  queryEpisodes(query: EpisodeQuery) {
    const search = query.search.trim().toLocaleLowerCase();
    const filtered = this.#episodes().filter(
      (episode) =>
        (episode.name.toLocaleLowerCase().includes(search)
          || episode.id.toLocaleLowerCase().includes(search)) &&
        (query.robotId === null || episode.robotId === query.robotId) &&
        (query.environment === null || episode.provenance.environment === query.environment) &&
        (query.deliveryMode === null || episode.provenance.deliveryMode === query.deliveryMode),
    );
    const sorted = [...filtered].sort((left, right) => {
      const primary = query.sort === 'oldest'
        ? left.createdAtMs - right.createdAtMs
        : query.sort === 'bytes-desc'
          ? right.bytesWritten - left.bytesWritten
          : query.sort === 'duration-desc'
            ? right.durationMs - left.durationMs
            : right.createdAtMs - left.createdAtMs;
      return primary === 0 ? left.id.localeCompare(right.id) : primary;
    });
    return Promise.resolve(createPageResult(sorted, query));
  }

  getEpisode(episodeId: string): Promise<Episode | null> {
    return Promise.resolve(this.#findEpisode(episodeId));
  }

  createEpisode(input: CreateEpisodeInput): Promise<Episode> {
    const existing = this.#episodes().find(
      (episode) => episode.captureSessionId === input.captureSessionId,
    );
    if (existing !== undefined) return Promise.resolve(existing);
    if (input.id !== undefined && input.id.trim().length === 0) {
      return Promise.reject(new Error('에피소드 ID는 비어 있을 수 없습니다.'));
    }
    if (input.id !== undefined && this.#findEpisode(input.id) !== null) {
      return Promise.reject(new Error(`이미 사용 중인 에피소드 ID입니다: ${input.id}`));
    }
    const episode: Episode = { ...input, id: input.id ?? this.#nextId() };
    this.#store.setState((state) => ({ episodes: [episode, ...state.episodes] }));
    return Promise.resolve(episode);
  }

  subscribe(listener: () => void): () => void {
    return this.#store.subscribe(listener);
  }

  #episodes(): readonly Episode[] {
    return this.#store.getState().episodes;
  }

  #nextId(): string {
    let candidate: string;
    do {
      this.#sequence += 1;
      candidate = `episode-${String(this.#sequence).padStart(4, '0')}`;
    } while (this.#findEpisode(candidate) !== null);
    return candidate;
  }

  #findEpisode(episodeId: string): Episode | null {
    return this.#episodes().find((episode) => episode.id === episodeId) ?? null;
  }
}
