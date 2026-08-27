import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  EpisodeRepositoryContext,
  type Episode,
  type EpisodeRepositoryPort,
} from '@/entities/episode';

import { EpisodeDetailPage } from './EpisodeDetailPage';

const episode: Episode = {
  id: 'episode-001',
  name: '정찰 에피소드',
  captureSessionId: 'session-001',
  robotId: 'robot-001',
  sensorDeviceId: 'sensor-rig-001',
  integrationProfileId: 'multisensor-rig-v1',
  provenance: {
    environment: 'physical',
    deliveryMode: 'live',
    controlMode: 'teleop',
    dataOrigin: 'captured',
  },
  createdAtMs: Date.parse('2026-08-24T00:00:00Z'),
  durationMs: 60_000,
  bytesWritten: 32_000_000,
  streams: [
    {
      id: 'pose',
      displayName: '위치',
      bytesWritten: 4_000_000,
      observedRateHz: 20,
    },
  ],
};

function createRepository(
  getEpisode: EpisodeRepositoryPort['getEpisode'],
  subscribe: EpisodeRepositoryPort['subscribe'],
): EpisodeRepositoryPort {
  return {
    createEpisode: () => Promise.reject(new Error('사용하지 않는 생성')),
    getEpisode,
    listEpisodes: () => Promise.reject(new Error('사용하지 않는 목록 조회')),
    queryEpisodes: () => Promise.reject(new Error('사용하지 않는 목록 검색')),
    subscribe,
  };
}

describe('EpisodeDetailPage', () => {
  it('갱신 실패 시 기존 정보를 유지하고 재시도로 최신 정보를 복구한다', async () => {
    const user = userEvent.setup();
    const recoveredEpisode: Episode = {
      ...episode,
      name: '복구된 정찰 에피소드',
    };
    const getEpisode = vi
      .fn<EpisodeRepositoryPort['getEpisode']>()
      .mockResolvedValueOnce(episode)
      .mockRejectedValueOnce(new Error('에피소드 갱신 실패'))
      .mockResolvedValueOnce(recoveredEpisode);
    let invalidate: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn<EpisodeRepositoryPort['subscribe']>((listener) => {
      invalidate = listener;
      return unsubscribe;
    });
    const repository = createRepository(getEpisode, subscribe);

    render(
      <EpisodeRepositoryContext.Provider value={repository}>
        <MemoryRouter initialEntries={['/mlops/episodes/episode-001']}>
          <Routes>
            <Route
              element={<EpisodeDetailPage />}
              path="/mlops/episodes/:episodeId"
            />
          </Routes>
        </MemoryRouter>
      </EpisodeRepositoryContext.Provider>,
    );

    expect(
      await screen.findByRole('heading', { name: episode.name }),
    ).toBeInTheDocument();
    expect(getEpisode).toHaveBeenCalledOnce();

    act(() => invalidate?.());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '기존 에피소드 정보는 유지했습니다. 에피소드 갱신 실패',
    );
    expect(
      screen.getByRole('heading', { name: episode.name }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));

    expect(
      await screen.findByRole('heading', { name: recoveredEpisode.name }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(getEpisode).toHaveBeenCalledTimes(3);
  });
});
