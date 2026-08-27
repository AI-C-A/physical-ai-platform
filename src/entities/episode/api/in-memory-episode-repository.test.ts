import { describe, expect, it, vi } from 'vitest';

import type { CreateEpisodeInput, Episode } from '../model/episode';
import { InMemoryEpisodeRepository } from './in-memory-episode-repository';

function createEpisode(
  id: string,
  overrides: Partial<Episode> = {},
): Episode {
  return {
    id,
    name: '공통 Episode',
    captureSessionId: `session-${id}`,
    robotId: 'robot-001',
    sensorDeviceId: 'sensor-rig-001',
    integrationProfileId: 'profile-owned',
    provenance: {
      environment: 'simulation',
      deliveryMode: 'replay',
      controlMode: 'autonomous',
      dataOrigin: 'synthetic',
    },
    createdAtMs: 1_000,
    durationMs: 10_000,
    bytesWritten: 1_000,
    streams: [],
    ...overrides,
  };
}

describe('InMemoryEpisodeRepository', () => {
  it('검색·provenance 필터·정렬·페이지를 같은 결과 집합에 적용하고 동률은 ID로 고정한다', async () => {
    const repository = new InMemoryEpisodeRepository([
      createEpisode('episode-b'),
      createEpisode('episode-a'),
      createEpisode('episode-c', {
        name: '다른 Episode',
        robotId: 'robot-002',
        provenance: {
          environment: 'physical',
          deliveryMode: 'live',
          controlMode: 'teleop',
          dataOrigin: 'captured',
        },
        createdAtMs: 2_000,
      }),
    ]);

    const baseQuery = {
      search: '  공통  ',
      robotId: 'robot-001',
      environment: 'simulation' as const,
      deliveryMode: 'replay' as const,
      sort: 'newest' as const,
      pageSize: 1,
    };
    const firstPage = await repository.queryEpisodes({ ...baseQuery, page: 1 });
    const secondPage = await repository.queryEpisodes({ ...baseQuery, page: 2 });

    expect(firstPage).toMatchObject({ totalItems: 2, totalPages: 2, page: 1 });
    expect(firstPage.items.map((episode) => episode.id)).toEqual(['episode-a']);
    expect(secondPage.items.map((episode) => episode.id)).toEqual(['episode-b']);

    await expect(repository.queryEpisodes({
      ...baseQuery,
      page: 1,
      pageSize: 20,
      sort: 'bytes-desc',
    })).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: 'episode-a' }),
        expect.objectContaining({ id: 'episode-b' }),
      ],
    });

    await expect(repository.queryEpisodes({
      ...baseQuery,
      search: ' EPISODE-B ',
      page: 1,
      pageSize: 20,
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'episode-b' })],
      totalItems: 1,
    });
  });

  it('같은 Capture Session의 후속 Episode 생성을 멱등 처리하고 한 번만 알린다', async () => {
    const repository = new InMemoryEpisodeRepository([]);
    const listener = vi.fn();
    repository.subscribe(listener);
    const input: CreateEpisodeInput = {
      name: '공통 Episode',
      captureSessionId: 'session-completed-001',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      integrationProfileId: 'profile-owned',
      provenance: {
        environment: 'simulation',
        deliveryMode: 'replay',
        controlMode: 'autonomous',
        dataOrigin: 'synthetic',
      },
      createdAtMs: 1_000,
      durationMs: 10_000,
      bytesWritten: 1_000,
      streams: [],
    };

    const first = await repository.createEpisode(input);
    const second = await repository.createEpisode({
      ...input,
      name: '중복 후속 작업',
    });

    expect(second).toEqual(first);
    await expect(repository.listEpisodes()).resolves.toEqual([first]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('초기 데이터와 충돌하지 않는 내부 ID를 만들고 다른 Session의 명시적 중복 ID를 거부한다', async () => {
    const existing = createEpisode('episode-0101');
    const repository = new InMemoryEpisodeRepository([existing]);
    const input: CreateEpisodeInput = {
      name: '신규 Episode',
      captureSessionId: 'session-new',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      integrationProfileId: 'profile-owned',
      provenance: existing.provenance,
      createdAtMs: 2_000,
      durationMs: 20_000,
      bytesWritten: 2_000,
      streams: [],
    };

    await expect(repository.createEpisode(input)).resolves.toMatchObject({
      id: 'episode-0102',
    });
    await expect(repository.createEpisode({
      ...input,
      id: 'episode-0101',
      captureSessionId: 'session-conflict',
    })).rejects.toThrow('이미 사용 중인 에피소드 ID');
    await expect(repository.listEpisodes()).resolves.toHaveLength(2);
  });

  it('빈 명시적 ID를 Episode 식별자로 저장하지 않는다', async () => {
    const repository = new InMemoryEpisodeRepository([]);
    const input: CreateEpisodeInput = {
      id: '   ',
      name: '신규 Episode',
      captureSessionId: 'session-new',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      integrationProfileId: 'profile-owned',
      provenance: {
        environment: 'simulation',
        deliveryMode: 'replay',
        controlMode: 'autonomous',
        dataOrigin: 'synthetic',
      },
      createdAtMs: 2_000,
      durationMs: 20_000,
      bytesWritten: 2_000,
      streams: [],
    };

    await expect(repository.createEpisode(input)).rejects.toThrow(
      '에피소드 ID는 비어 있을 수 없습니다.',
    );
    await expect(repository.listEpisodes()).resolves.toEqual([]);
  });
});
