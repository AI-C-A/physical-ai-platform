import { BrandingContext } from '@/shared/config';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';
import { collectionPreviewState } from './collection-preview-state';
import { HumanoidCollectionDetailPage } from './FlywheelWorkspacePages';

async function fixture() {
  const port = createInMemoryFlywheel({ nowMs: () => Date.now() });
  const session = await port.createHumanDemonstrationSession({
    projectId: 'project-tiger', siteId: 'site-lab', name: '소스 상태 일관성', taskId: 'task-sort', instruction: '물체 분류',
    exoskeletonDeviceId: 'exo-1', questDeviceId: 'quest-1', headCameraDeviceId: 'head-1', externalCameraDeviceId: 'external-1',
  });
  return { port, session };
}

describe('collection preview state', () => {
  it('미연결·명시적 끊김·수신 지연을 구분하고 전체 상태로 개별 정상 소스를 덮지 않는다', async () => {
    const { port, session } = await fixture();
    try {
      const telemetry = (await port.getCollectionTelemetry(session.id))!;
      const now = telemetry.observedAtMs;
      expect(collectionPreviewState(session, telemetry, 'quest-hand-left', now, false)).toBe('idle');
      expect(collectionPreviewState(session, { ...telemetry, connectionState: 'offline' }, 'rbp-head-rgb', now, false)).toBe('live');
      expect(collectionPreviewState(session, telemetry, 'rbp-head-rgb', now + telemetry.freshness.staleAfterMs, false)).toBe('stale');
      expect(collectionPreviewState(session, telemetry, 'rbp-head-rgb', now + telemetry.freshness.offlineAfterMs, false)).toBe('offline');
      expect(collectionPreviewState(session, telemetry, 'rbp-head-rgb', now, true)).toBe('offline');
      const offline = await port.updateHumanDemonstrationSource(session.id, 'external-1', 'offline');
      expect(collectionPreviewState(offline, telemetry, 'external-fullbody-rgb', now, false)).toBe('offline');
    } finally { port.dispose(); }
  });

  it('카메라가 끊기면 파생 영상도 숨기고 외부 카메라는 같은 끊김 화면을 표시하며 Quest는 유지한다', async () => {
    const { port, session } = await fixture();
    try {
      await port.updateHumanDemonstrationSource(session.id, 'quest-1', 'ready');
      await port.updateHumanDemonstrationSource(session.id, 'head-1', 'offline');
      await port.updateHumanDemonstrationSource(session.id, 'external-1', 'offline');
      render(<BrandingContext.Provider value={{ productName: 'ROBOT Army TIGER+', shortName: 'ROBOT Army TIGER+', logo: '/assets/army-tiger-logo.png' }}><MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
        <FlywheelContext.Provider value={port}><Routes>
          <Route path="/mlops/collection/:sessionId" element={<HumanoidCollectionDetailPage />} />
        </Routes></FlywheelContext.Provider>
      </MemoryRouter></BrandingContext.Provider>);
      const cameras = await screen.findByRole('region', { name: '실시간 수집 카메라' });
      await waitFor(() => expect(within(cameras).getAllByText('연결과 전원 상태를 확인하세요.')).toHaveLength(2));
      expect(within(cameras).queryByText('수신 대기')).not.toBeInTheDocument();
      const perception = screen.getByRole('region', { name: 'Head RGB Depth와 세그멘테이션' });
      expect(perception).toHaveAttribute('data-stream-state', 'offline');
      expect(within(perception).queryByRole('img')).not.toBeInTheDocument();
      expect(await screen.findByRole('region', { name: 'Quest 손 포즈 3D' })).toHaveAttribute('data-stream-state', 'live');
      expect(screen.queryByRole('button', { name: 'Episode 녹화 시작' })).not.toBeInTheDocument();
      await act(async () => { await port.updateHumanDemonstrationSource(session.id, 'head-1', 'ready'); });
      await waitFor(() => expect(perception).toHaveAttribute('data-stream-state', 'live'));
      expect(within(perception).getByAltText('Head RGB 상대 깊이')).toBeVisible();
      expect(within(cameras).getAllByText('연결과 전원 상태를 확인하세요.')).toHaveLength(1);
      expect(await screen.findByRole('button', { name: 'Episode 녹화 시작' })).toBeEnabled();
    } finally { port.dispose(); }
  });
});
