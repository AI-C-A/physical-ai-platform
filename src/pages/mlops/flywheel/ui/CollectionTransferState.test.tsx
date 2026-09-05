import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';

import { HumanoidCollectionDetailPage } from './FlywheelWorkspacePages';

it('필수 원본 전송을 기다리는 동안 검토 작업을 숨기고 정지 응답 후 저장과 재녹화를 허용한다', async () => {
  vi.useFakeTimers();
  const clock = { nowMs: () => Date.now() };
  const port = createInMemoryFlywheel(clock);
  let unmount: (() => void) | undefined;
  try {
    const session = await port.createHumanDemonstrationSession({
      projectId: 'project-tiger', siteId: 'site-lab', name: '전송 대기 중인 녹화',
      taskId: 'task-sort', instruction: '분류', exoskeletonDeviceId: 'exoskeleton-001',
      questDeviceId: 'quest2-001', headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: '',
    });
    await port.updateHumanDemonstrationSource(session.id, 'quest2-001', 'ready');
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);
    const save = vi.spyOn(port, 'saveEpisode');
    const discard = vi.spyOn(port, 'deleteEpisode');
    await act(async () => {
      ({ unmount } = render(
        <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
          <FlywheelContext.Provider value={port}>
            <Routes><Route path="/mlops/collection/:sessionId" element={<HumanoidCollectionDetailPage />} /></Routes>
          </FlywheelContext.Provider>
        </MemoryRouter>,
      ));
      await vi.advanceTimersByTimeAsync(0);
    });
    const controls = screen.getByRole('region', { name: '수집 작업 컨트롤' });
    expect(controls).toHaveAttribute('data-collection-state', 'recording');
    await act(async () => {
      fireEvent.click(within(controls).getByRole('button', { name: 'Episode 녹화 정지' }));
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(await port.getEpisode(episode.id)).toMatchObject({ status: 'completed' });
    expect(controls).toHaveAttribute('data-collection-state', 'finalizing');
    expect(controls).toHaveTextContent('원본 전송 중');
    expect(screen.getByRole('status', { name: '현재 수집 상태' })).toHaveTextContent('원본 전송 중');
    expect(screen.getByText('필수 장치의 전송 완료를 기다리고 있습니다. 수집 장치의 연결을 유지하세요.')).toBeVisible();
    expect(screen.queryByRole('button', { name: '녹화본 저장' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 녹화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Episode 재생 컨트롤' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '수집 콘솔 닫기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '백그라운드에서 계속하고 나가기' })).toBeEnabled();
    expect(within(dialog).queryByRole('button', { name: '녹화본 저장하고 마치기' })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(controls).toHaveAttribute('data-collection-state', 'finalizing');
    expect(save).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();

    await act(async () => {
      await port.acknowledgeCollectorCommand({
        sessionId: session.id, episodeId: episode.id, sourceDeviceId: 'quest2-001',
        command: 'stop', state: 'acknowledged', acknowledgedAtMs: clock.nowMs(), detail: null,
      });
    });
    expect(within(dialog).getByRole('button', { name: '녹화본 저장하고 마치기' })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '계속 확인' }));
    expect(controls).toHaveAttribute('data-collection-state', 'review');
    expect(within(controls).getByRole('button', { name: '다시 녹화' })).toBeEnabled();
    expect(screen.getByRole('group', { name: 'Episode 재생 컨트롤' })).toBeVisible();
    await act(async () => {
      fireEvent.click(within(controls).getByRole('button', { name: '녹화본 저장' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(episode.id);
    expect(within(controls).getByRole('button', { name: '다음 Episode 녹화 시작' })).toBeEnabled();
  } finally {
    unmount?.();
    port.dispose();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
