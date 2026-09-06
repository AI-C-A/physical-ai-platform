import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext, useFlywheelQuery, type FlywheelPort } from '@/entities/flywheel';

import { useAutomaticPreflight } from './use-automatic-preflight';

describe('automatic preflight', () => {
  it('세션을 열면 점검하고 연결 변경 시 다시 판정하며 녹화 중에는 상태를 초기화하지 않는다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => Date.now() });
    try {
      const session = await port.createHumanDemonstrationSession({
        projectId: 'project-tiger', siteId: 'site-lab', name: '자동 점검',
        taskId: 'task-sort', instruction: '물체 분류', exoskeletonDeviceId: 'exo-1',
        questDeviceId: 'quest-1', headCameraDeviceId: 'head-1', externalCameraDeviceId: '',
      });
      const validate = vi.spyOn(port, 'validateSession');
      const load = (value: FlywheelPort) => value.getSession(session.id);
      const wrapper = ({ children }: PropsWithChildren) => <FlywheelContext.Provider value={port}>{children}</FlywheelContext.Provider>;
      const { result, unmount } = renderHook(() => {
        const query = useFlywheelQuery(load);
        return useAutomaticPreflight(query.status === 'ready' ? query.data : null);
      }, { wrapper });
      await waitFor(() => expect(validate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.error).toContain('필수 장치'));
      await act(async () => { await port.updateHumanDemonstrationSource(session.id, 'quest-1', 'ready'); });
      await waitFor(() => expect(result.current).toEqual({ checking: false, error: null }));
      expect(await port.getSession(session.id)).toMatchObject({ status: 'ready', activeEpisodeId: null });
      expect(validate).toHaveBeenCalledTimes(2);

      await act(async () => { await port.updateHumanDemonstrationSource(session.id, 'head-1', 'offline'); });
      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(await port.getSession(session.id)).toMatchObject({ status: 'draft' });
      await act(async () => { await port.updateHumanDemonstrationSource(session.id, 'head-1', 'ready'); });
      await waitFor(() => expect(result.current.error).toBeNull());
      await act(async () => { await port.startSession(session.id); await port.startEpisode(session.id); });
      const count = validate.mock.calls.length;
      await act(async () => { await port.updateHumanDemonstrationSource(session.id, 'quest-1', 'offline'); });
      expect(validate).toHaveBeenCalledTimes(count);
      const active = await port.getSession(session.id);
      expect(active).toMatchObject({ status: 'active' });
      expect(active?.kind === 'humanoid' ? active.activeEpisodeId : null).not.toBeNull();
      unmount();
    } finally { port.dispose(); }
  });
});
