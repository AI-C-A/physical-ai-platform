import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryCaptureSessions,
  InMemoryCaptureOperationsAdapter,
  type CaptureSessionStatus,
} from '@/entities/capture-session';
import { createInMemoryDatasetRepository } from '@/entities/dataset';
import { createInMemoryEpisodeRepository } from '@/entities/episode';
import type { ClockPort } from '@/shared/lib/clock';

import { InMemoryAnalyticsAdapter } from './in-memory-analytics-adapter';

const nowMs = Date.parse('2026-08-21T09:00:00+09:00');
const clock: ClockPort = { nowMs: () => nowMs };
const allStatuses: readonly CaptureSessionStatus[] = [
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
];

function createAdapter() {
  const template = createInMemoryCaptureSessions(clock)[0];
  if (template === undefined) throw new Error('수집 세션 fixture가 없습니다.');
  const sessions = allStatuses.map((status, index) => ({
    ...template,
    id: `session-status-${String(index)}`,
    status,
    createdAtMs: nowMs - index * 1_000,
  }));
  return new InMemoryAnalyticsAdapter({
    capture: new InMemoryCaptureOperationsAdapter({ initialSessions: sessions }),
    datasets: createInMemoryDatasetRepository(clock),
    episodes: createInMemoryEpisodeRepository(clock),
  });
}

describe('InMemoryAnalyticsAdapter', () => {
  it('수집 세션의 모든 상태를 Overview 합계에 빠짐없이 반영한다', async () => {
    const adapter = createAdapter();
    const overview = await adapter.getOverview({
      startMs: nowMs - 86_400_000,
      endMs: nowMs,
      robotId: null,
    });

    expect(overview.sessionCount).toBe(allStatuses.length);
    expect(
      overview.statusSeries.reduce((total, item) => total + item.value, 0),
    ).toBe(overview.sessionCount);
    expect(
      overview.trendSeries.reduce((total, item) => total + item.value, 0),
    ).toBe(overview.sessionCount);
    expect(overview.statusSeries.map((item) => item.label)).toEqual(allStatuses);
  });

  it('기록량을 제공하지 않는 Dataset을 0 B로 조작하지 않는다', async () => {
    const adapter = createAdapter();
    const result = await adapter.queryOperations({
      startMs: nowMs - 86_400_000,
      endMs: nowMs,
      robotId: null,
      type: 'dataset',
      status: null,
      environment: null,
      deliveryMode: null,
      groupBy: 'status',
    });

    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records.every((record) => record.bytes === null)).toBe(true);
    expect(result.groups).toEqual([
      { key: 'draft', count: result.records.length, bytes: null },
    ]);
  });

  it('Robot Overview의 Dataset 수를 연결 Episode 기준으로 제한한다', async () => {
    const adapter = createAdapter();
    const range = {
      startMs: nowMs - 10 * 86_400_000,
      endMs: nowMs,
    };

    const allRobots = await adapter.getOverview({ ...range, robotId: null });
    const firstRobot = await adapter.getOverview({
      ...range,
      robotId: 'robot-001',
    });

    expect(allRobots.datasetCount).toBe(5);
    expect(firstRobot.datasetCount).toBe(1);
  });

  it('실제 Robot ID unassigned와 연결되지 않은 Robot 그룹을 같은 sentinel로 만들지 않는다', async () => {
    const template = createInMemoryCaptureSessions(clock)[0];
    if (template === undefined) throw new Error('수집 세션 fixture가 없습니다.');
    const adapter = new InMemoryAnalyticsAdapter({
      capture: new InMemoryCaptureOperationsAdapter({
        initialSessions: [{ ...template, robotId: 'unassigned' }],
      }),
      datasets: createInMemoryDatasetRepository(clock),
      episodes: createInMemoryEpisodeRepository(clock),
    });
    const queryRange = {
      startMs: nowMs - 10 * 86_400_000,
      endMs: nowMs,
      robotId: null,
      status: null,
      environment: null,
      deliveryMode: null,
      groupBy: 'robot' as const,
    };

    const sessionGroups = await adapter.queryOperations({
      ...queryRange,
      type: 'session',
    });
    const datasetGroups = await adapter.queryOperations({
      ...queryRange,
      type: 'dataset',
    });

    expect(sessionGroups.groups).toEqual([
      expect.objectContaining({ key: 'unassigned' }),
    ]);
    expect(datasetGroups.groups).toEqual([
      expect.objectContaining({ key: null }),
    ]);
  });

  it('중간 invalidation 구독 실패 시 먼저 획득한 구독을 되돌린다', () => {
    const capture = new InMemoryCaptureOperationsAdapter();
    const episodes = createInMemoryEpisodeRepository(clock);
    const datasets = createInMemoryDatasetRepository(clock);
    const unsubscribeCapture = vi.fn();
    vi.spyOn(capture, 'subscribeSessions').mockReturnValue(unsubscribeCapture);
    vi.spyOn(episodes, 'subscribe').mockImplementation(() => {
      throw new Error('Episode 구독 실패');
    });
    const subscribeDatasets = vi.spyOn(datasets, 'subscribe');
    const adapter = new InMemoryAnalyticsAdapter({ capture, datasets, episodes });

    expect(() => adapter.subscribe(vi.fn())).toThrow('Episode 구독 실패');

    expect(unsubscribeCapture).toHaveBeenCalledOnce();
    expect(subscribeDatasets).not.toHaveBeenCalled();
  });

  it('invalidation 해제 하나가 실패해도 모든 구독을 한 번씩 정리한다', () => {
    const capture = new InMemoryCaptureOperationsAdapter();
    const episodes = createInMemoryEpisodeRepository(clock);
    const datasets = createInMemoryDatasetRepository(clock);
    const unsubscribeCapture = vi.fn();
    const unsubscribeEpisodes = vi.fn();
    const unsubscribeDatasets = vi.fn(() => {
      throw new Error('Dataset 구독 해제 실패');
    });
    vi.spyOn(capture, 'subscribeSessions').mockReturnValue(unsubscribeCapture);
    vi.spyOn(episodes, 'subscribe').mockReturnValue(unsubscribeEpisodes);
    vi.spyOn(datasets, 'subscribe').mockReturnValue(unsubscribeDatasets);
    const adapter = new InMemoryAnalyticsAdapter({ capture, datasets, episodes });
    const unsubscribe = adapter.subscribe(vi.fn());

    expect(() => unsubscribe()).not.toThrow();
    unsubscribe();

    expect(unsubscribeCapture).toHaveBeenCalledOnce();
    expect(unsubscribeEpisodes).toHaveBeenCalledOnce();
    expect(unsubscribeDatasets).toHaveBeenCalledOnce();
  });
});
