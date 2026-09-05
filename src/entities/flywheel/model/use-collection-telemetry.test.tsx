import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel } from '../api/in-memory-flywheel';
import { FlywheelContext } from './flywheel-context';
import {
  getEffectiveCollectionConnectionState,
  useCollectionTelemetry,
} from './use-collection-telemetry';

describe('useCollectionTelemetry', () => {
  it('subscription 갱신 실패 시 마지막 정상 snapshot과 수신 시각을 보존하고 OFFLINE으로 표시한다', async () => {
    let now = 1_800_000_000_000;
    const port = createInMemoryFlywheel({ nowMs: () => now });
    const session = await port.createHumanoidSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: 'telemetry hook',
      robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', taskId: 'task-sort',
      instruction: 'Sort objects',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    await port.startEpisode(session.id);
    now += 5_000;

    const wrapper = ({ children }: PropsWithChildren) => (
      <FlywheelContext.Provider value={port}>{children}</FlywheelContext.Provider>
    );
    const { result } = renderHook(() => useCollectionTelemetry(session.id), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.effectiveConnectionState).toBe('live');
    const firstSnapshot = result.current.status === 'ready' ? result.current.data : null;

    vi.spyOn(port, 'getCollectionTelemetry').mockRejectedValueOnce(new Error('subscription unavailable'));
    await act(async () => {
      await port.reportStreamFailure(session.id, 'camera-head-depth', false);
    });

    await waitFor(() => expect(result.current.refreshError).toBe('subscription unavailable'));
    expect(result.current.status).toBe('ready');
    expect(result.current.status === 'ready' ? result.current.data : null).toEqual(firstSnapshot);
    expect(result.current.lastObservedAtMs).toBe(firstSnapshot?.observedAtMs);
    expect(result.current.effectiveConnectionState).toBe('offline');
    port.dispose();
  });

  it('마지막 관측 시각을 기준으로 LIVE, STALE, OFFLINE을 구분한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const snapshot = await port.getCollectionTelemetry('capture-h-001');
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const liveSnapshot = {
      ...snapshot,
      connectionState: 'live' as const,
      freshness: { staleAfterMs: 2_000, offlineAfterMs: 7_000 },
    };

    expect(getEffectiveCollectionConnectionState(liveSnapshot, snapshot.observedAtMs + 1_999, null))
      .toBe('live');
    expect(getEffectiveCollectionConnectionState(liveSnapshot, snapshot.observedAtMs + 2_000, null))
      .toBe('stale');
    expect(getEffectiveCollectionConnectionState(liveSnapshot, snapshot.observedAtMs + 7_000, null))
      .toBe('offline');
    port.dispose();
  });
});
