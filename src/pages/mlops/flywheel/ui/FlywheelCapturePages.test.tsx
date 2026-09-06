import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryFlywheel,
  createUnavailableFlywheel,
  FlywheelContext,
} from '@/entities/flywheel';
import { ToastProvider } from '@/shared/ui/toast';
import { fillCollectionSetup } from '@/test/fill-collection-setup';

import { CatalogDetailPage, CatalogPage } from './FlywheelDataPages';
import {
  CollectionWorkspacePage,
  CollectionConnectionPage,
  HumanoidCollectionDetailPage,
  NewHumanoidCollectionPage,
} from './FlywheelWorkspacePages';

describe('HumanoidCollectionDetailPage', () => {
  it('Episode 조회 실패를 안내하고 재시도 후 녹화 작업을 복구한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await port.createHumanoidSession({
        instruction: 'Sort objects', name: 'Episode 조회 복구', projectId: 'project-tiger',
        robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
      });
      await port.validateSession(session.id);
      const listEpisodes = vi.spyOn(port, 'listEpisodes').mockRejectedValue(new Error('Episode 조회 실패'));
      render(
        <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
            </Routes>
          </FlywheelContext.Provider>
        </MemoryRouter>,
      );
      await user.click(await screen.findByRole('tab', { name: /^문제 · \d+$/u }));
      expect(await screen.findByRole('heading', { name: '데이터를 불러오지 못했습니다' })).toBeVisible();
      expect(screen.getByText('Episode 상태 확인 필요')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Episode 녹화 시작' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '수집 콘솔 닫기' })).toBeDisabled();
      listEpisodes.mockRestore();
      await user.click(within(screen.getByRole('region', { name: 'Episode 조회 오류' })).getByRole('button', { name: '다시 시도' }));
      expect(await screen.findByRole('button', { name: 'Episode 녹화 시작' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '수집 콘솔 닫기' })).toBeEnabled();
      expect(screen.queryByText('Episode 상태 확인 필요')).not.toBeInTheDocument();
    } finally {
      port.dispose();
    }
  });

  it('녹화 중 수집 목록으로 이동하면 Episode만 정지하고 세션을 유지한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanoidSession({
      instruction: 'Sort the fruit into the matching trays',
      name: 'OpenArm collection',
      projectId: 'project-tiger',
      robotId: 'robot-003',
      sensorDeviceId: 'sensor-rig-001',
      siteId: 'site-lab',
      taskId: 'task-sort-fruit',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);

    render(
      <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
        <ToastProvider>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route
                element={<HumanoidCollectionDetailPage />}
                path="/mlops/collection/:sessionId"
              />
              <Route element={<p>수집 세션 목록</p>} path="/mlops/collection" />
            </Routes>
          </FlywheelContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'OpenArm collection' })).toBeInTheDocument();
    const workspaceExit = screen.getByRole('button', { name: '수집 콘솔 닫기' });
    expect(workspaceExit).toHaveTextContent('');
    expect(workspaceExit.querySelector('svg')).toBeInTheDocument();
    expect(workspaceExit).toHaveAttribute('title', '닫기');
    expect(workspaceExit.closest('header')).toHaveAttribute('data-collection-header');
    expect(screen.queryByText('Episode 구간만 synchronized recording에 포함됩니다.')).not.toBeInTheDocument();
    expect(screen.queryByText('전면 RGB의 전신 자세와 헤드 RGB의 손 추적을 융합합니다.')).not.toBeInTheDocument();
    expect(screen.queryByText(/현재 기록을 끝낼 방법을 선택하세요/u)).not.toBeInTheDocument();
    expect(screen.queryByText('3D 자세 추정')).not.toBeInTheDocument();
    expect(screen.queryByText('자세 추정 3D')).not.toBeInTheDocument();
    expect(screen.queryByText('더보기')).not.toBeInTheDocument();
    const sessionInfo = screen.getByRole('region', { name: '세션 정보' });
    expect(sessionInfo).toBeVisible();
    const detailsToggle = screen.getByRole('tab', { name: '세션 정보' });
    expect(screen.queryByRole('button', { name: '수집 상세 닫기' })).not.toBeInTheDocument();
    await user.click(detailsToggle);
    expect(sessionInfo).not.toBeVisible();
    expect(screen.getByRole('region', { name: '실시간 수집 카메라' })).toBeVisible();
    const detailsOpen = screen.getByRole('tab', { name: '세션 정보' });
    expect(detailsOpen.closest('.collection-workspace')).toBeInTheDocument();
    expect(detailsOpen).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tablist', { name: '수집 상세 메뉴' })).toHaveAttribute('aria-orientation', 'vertical');
    await waitFor(() => expect(detailsOpen).toHaveFocus());
    await user.click(detailsOpen);
    expect(sessionInfo).toBeVisible();
    await user.click(detailsOpen);
    expect(sessionInfo).not.toBeVisible();
    expect(detailsOpen).toHaveAttribute('aria-selected', 'false');
    await waitFor(() => expect(detailsOpen).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: '수집 상태' })).toHaveFocus();
    expect(screen.queryByRole('complementary', { name: '수집 상세' })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tabpanel', { name: '수집 상태' })).toBeVisible();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('complementary', { name: '수집 상세' })).not.toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.getByRole('tabpanel', { name: '수집 상태' })).toBeVisible();
    await user.keyboard(' ');
    expect(screen.queryByRole('complementary', { name: '수집 상세' })).not.toBeInTheDocument();
    await user.click(detailsOpen);
    expect(within(sessionInfo).queryByRole('button', { name: '수집 목록으로 이동' }))
      .not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByRole('tab', { name: '동기화' })).not.toBeInTheDocument();
    expect(within(sessionInfo).queryByText('장치 연결과 명령 응답')).not.toBeInTheDocument();
    expect(within(sessionInfo).getByText(/task-sort-fruit/u)).toBeVisible();
    expect(within(sessionInfo).getByText('robot-003')).toBeVisible();
    expect(within(sessionInfo).getByText('preset-humanoid-default')).toBeVisible();
    expect(within(sessionInfo).getByText('sensor-rig-001')).toBeVisible();
    expect(within(sessionInfo).getByText('로봇 시연')).toBeVisible();
    expect(within(sessionInfo).getByText('project-tiger')).toBeVisible();
    expect(within(sessionInfo).getByText('site-lab')).toBeVisible();
    expect(within(sessionInfo).getByText('생성 시각')).toBeVisible();
    expect(within(sessionInfo).getByText('시작 시각')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '세션 정보' })).not.toBeInTheDocument();
    expect(screen.queryByText('저장한 Episode 0개')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '세션 정보' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '세션 정보 닫기' })).not.toBeInTheDocument();
    const cameraRegion = screen.getByRole('region', { name: '실시간 수집 카메라' });
    const frontRgb = within(cameraRegion).getByLabelText('전면 RGB · 전신');
    expect(cameraRegion.closest('[data-capture-viewport]')).toHaveClass('overflow-hidden');
    expect(cameraRegion.parentElement).toHaveAttribute('data-primary-visual', 'camera');
    expect(cameraRegion.parentElement).not.toHaveClass(
      'rounded-[var(--design-radius-surface)]',
      'bg-layer-base',
      'p-2',
    );
    const poseVisual = document.querySelector('[data-primary-visual="pose"]');
    expect(poseVisual).toBeInTheDocument();
    expect(poseVisual?.querySelector('[data-surface-layer]')).not.toBeInTheDocument();
    expect(frontRgb.closest('figure')).toHaveClass(
      'rounded-[var(--design-radius-surface)]',
      'bg-layer-canvas',
    );
    expect(frontRgb.tagName).toBe('IMG');
    expect(frontRgb).toHaveAttribute(
      'src',
      '/assets/flywheel/humanoid-camera-front-rgb.png',
    );
    expect(within(frontRgb.closest('figure') as HTMLElement).getByRole('img', {
      name: '전신 스켈레톤 인식 · 관절 17개 · 추적 중',
    })).toBeVisible();
    expect(within(cameraRegion).getByLabelText('헤드 RGB')).toBeVisible();
    expect(within(cameraRegion).getByLabelText('헤드 Depth'))
      .toHaveAttribute('data-render-mode', 'depth');
    expect(screen.queryByText('OpenArm · 5지 시각화')).not.toBeInTheDocument();
    expect(screen.queryByText('3D 스켈레톤')).not.toBeInTheDocument();
    expect(screen.getAllByText('실시간').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: '수집 상태' }));
    expect(screen.getAllByText(/FPS/u).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: '세션 정보' }));
    expect(screen.getByRole('region', {
      name: '전면 RGB 전신과 헤드 RGB 손 추적 3D 스켈레톤',
    })).toBeVisible();
    expect(cameraRegion.closest('[data-color-scheme="dark"]')).toBeInTheDocument();
    const captureControls = screen.getByRole('region', { name: '수집 작업 컨트롤' });
    expect(captureControls).toHaveClass('bg-transparent', 'border-0');
    expect(screen.queryByRole('complementary', { name: '세션 및 수집 제어' })).not.toBeInTheDocument();
    const captureViewport = document.querySelector('[data-capture-viewport]');
    expect(captureViewport?.nextElementSibling).toBe(captureControls);
    expect(captureControls).toHaveAttribute('data-collection-state', 'recording');
    expect(captureControls).toHaveClass('shrink-0');
    expect(within(captureControls).queryByRole('status', { name: '현재 수집 상태' }))
      .not.toBeInTheDocument();
    const collectionStatus = screen.getByRole('status', { name: '현재 수집 상태' });
    expect(collectionStatus).toHaveTextContent('녹화 중');
    expect(collectionStatus).toHaveClass('sr-only');
    expect(collectionStatus.closest('[data-preview-workspace]')).toBeNull();
    expect(captureControls).toHaveTextContent(`${episode.name} · 녹화 중`);
    expect(document.querySelector('.collection-inspector [data-episode-summary]')).toBeNull();
    expect(screen.getByLabelText('녹화 경과 시간')).toBeVisible();
    const previewWorkspace = document.querySelector('[data-preview-workspace]');
    expect(previewWorkspace).not.toHaveAttribute('data-recording-tally');
    expect(screen.queryByRole('region', { name: '수집 운영 요약' })).not.toBeInTheDocument();
    expect(captureControls).not.toHaveTextContent(/저장 상태 확인 불가|정지 후 녹화본을 검토하고 저장할 수 있습니다/u);
    const currentSessionInfo = screen.getByRole('region', { name: '세션 정보' });
    expect(within(currentSessionInfo).getByText(/동기화 정상/u)).toBeVisible();
    expect(within(currentSessionInfo).getAllByText('원본 기록')).toHaveLength(1);
    expect(within(currentSessionInfo).getAllByText('데이터 품질')).toHaveLength(1);
    expect(within(currentSessionInfo).queryByRole('button', { name: '상세 진단' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(detailsToggle);
    expect(currentSessionInfo).not.toBeVisible();
    expect(within(cameraRegion).queryByText(/FPS/u)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '실시간 수집 카메라' })).toBe(cameraRegion);
    expect(await port.getSession(session.id)).toMatchObject({ activeEpisodeId: episode.id, status: 'active' });
    expect(await port.getEpisode(episode.id)).toMatchObject({ status: 'recording' });
    const stopRecording = within(captureControls).getByRole('button', { name: 'Episode 녹화 정지' });
    expect(stopRecording).toBeVisible();
    expect(stopRecording).not.toHaveClass('rounded-[var(--design-radius-round)]');
    expect(stopRecording.querySelector('svg')).toBeInTheDocument();
    expect(stopRecording).toHaveTextContent('녹화 정지');
    expect(within(captureControls).queryByRole('button', { name: 'Episode 삭제' }))
      .not.toBeInTheDocument();
    expect(within(captureControls).queryByRole('button', { name: /세션 종료/u }))
      .not.toBeInTheDocument();
    await user.click(workspaceExit);
    expect(screen.getByRole('dialog')).toHaveTextContent('녹화를 정지하고 나갈까요?');
    expect(screen.getByRole('dialog')).toHaveTextContent('세션은 계속 유지됩니다.');
    expect((await port.getSession(session.id))?.status).toBe('active');

    await user.click(screen.getByRole('button', { name: '계속 녹화' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(workspaceExit).toHaveFocus();

    await user.click(workspaceExit);
    await user.click(screen.getByRole('button', { name: '녹화 정지 후 나가기' }));

    await waitFor(async () => {
      expect(screen.getByText('수집 세션 목록')).toBeInTheDocument();
      expect((await port.getSession(session.id))?.status).toBe('active');
      expect(await port.getEpisode(episode.id)).toMatchObject({
        status: 'completed',
        outcome: null,
      });
    });
    port.dispose();
  });

  it.each(['normal', 'warning', 'critical', 'offline', 'stale', 'error'] as const)(
    '상세가 접혀 있어도 필요한 수집 경고만 표시한다: %s', async (scenario) => {
      const user = userEvent.setup();
      const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
      const session = await port.createHumanoidSession({
        instruction: 'Sort objects', name: 'Minimal collection', projectId: 'project-tiger',
        robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
      });
      await port.validateSession(session.id);
      const snapshot = await port.getCollectionTelemetry(session.id);
      if (snapshot === null) throw new Error('Missing telemetry fixture');
      const qualityIssues = scenario === 'warning' || scenario === 'critical'
        ? [{ id: 'test-quality', streamId: null, severity: scenario, message: '수집 데이터 점검 필요' }]
        : [];
      const getTelemetry = vi.spyOn(port, 'getCollectionTelemetry');
      if (scenario === 'error') getTelemetry.mockRejectedValue(new Error('상태 조회 실패'));
      else getTelemetry.mockResolvedValue({
        ...snapshot, observedAtMs: Date.now(), qualityIssues,
        connectionState: scenario === 'stale' ? 'stale' : 'live',
        streams: snapshot.streams.map((stream) => ({
          ...stream, connectionState: scenario === 'offline' && stream.required ? 'offline' : 'live',
          health: scenario === 'offline' && stream.required ? 'disconnected' : 'healthy',
          handTracking: scenario === 'offline' ? {
            qualityState: 'tracking', poseObserved: true, sourcePresent: true,
            consecutiveMissingMs: 0, validJointCount: 25,
          } : null,
        })),
      });
      render(
        <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
          <FlywheelContext.Provider value={port}>
            <Routes><Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" /></Routes>
          </FlywheelContext.Provider>
        </MemoryRouter>,
      );
      await screen.findByRole('heading', { name: 'Minimal collection' });
      await waitFor(() => expect(getTelemetry).toHaveBeenCalled());
      const details = screen.getByRole('complementary', { name: '수집 상세' });
      const detailsToggle = screen.getByRole('tab', { name: '세션 정보' });
      await user.click(detailsToggle);
      expect(details).not.toBeVisible();
      expect(screen.getAllByRole('tab')).toHaveLength(3);
      expect(screen.getByRole('tab', { name: '세션 정보' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByRole('region', { name: '현재 문제와 조치' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '문제 확인' })).not.toBeInTheDocument();
      if (scenario === 'normal') {
        expect(screen.queryByRole('button', { name: /^문제 \d+개$/u })).not.toBeInTheDocument();
        await user.click(screen.getByRole('tab', { name: '문제' }));
        expect(screen.getByText('현재 확인할 문제가 없습니다.')).toBeVisible();
      } else {
        await user.click(await screen.findByRole('tab', { name: /^문제 · \d+$/u }));
        const alerts = await screen.findByRole('region', { name: '현재 문제와 조치' });
        expect(alerts).toBeVisible();
        expect(screen.getAllByRole('region', { name: '현재 문제와 조치' })).toHaveLength(1);
        if (scenario === 'critical' || scenario === 'warning') expect(alerts).toHaveTextContent('수집 데이터 점검 필요');
        else if (scenario === 'offline') expect(alerts).toHaveTextContent('장치 연결과 수신 상태를 확인하세요');
        else if (scenario === 'stale') expect(alerts).toHaveTextContent('갱신 지연');
        else expect(alerts).toHaveTextContent('상태 조회 실패');
        expect(details).toBeVisible();
        expect(screen.getByRole('tab', { name: /^문제(?: · \d+)?$/u })).toHaveAttribute('aria-selected', 'true');
        if (scenario === 'offline') {
          expect(alerts).toHaveTextContent('연결 끊김');
          expect(alerts).not.toHaveTextContent('추적 정상');
        }
      }
      port.dispose();
    },
  );

  it('새 수집은 연결 전 가짜 preview를 숨기고 pairing과 사전점검을 순서대로 진행한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });

    render(
      <MemoryRouter initialEntries={['/mlops/collection/new']}>
        <FlywheelContext.Provider value={port}>
          <Routes>
            <Route element={<NewHumanoidCollectionPage />} path="/mlops/collection/new" />
            <Route element={<CollectionConnectionPage />} path="/mlops/collection/:sessionId/setup" />
          </Routes>
        </FlywheelContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '새 데이터 수집' }))
      .toBeInTheDocument();
    const setup = screen.getByRole('dialog', { name: '새 데이터 수집' });
    expect(within(setup).getByRole('group', { name: '수집 장치' })).toBeVisible();
    expect(screen.queryByRole('region', { name: /미리보기/u })).not.toBeInTheDocument();
    expect(within(setup).getByRole('button', { name: '취소' })).toBeEnabled();
    expect(screen.getByLabelText('작업 ID')).toHaveValue('');
    expect(screen.getByLabelText('외부 카메라 ID · 선택')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '세션 생성' }));
    expect(screen.queryByRole('status', { name: 'Quest pairing code' })).not.toBeInTheDocument();
    await fillCollectionSetup(user);
    expect(screen.getByLabelText('외부 카메라 ID · 선택')).toHaveValue('external-camera-001');
    expect(screen.getByLabelText('외부 카메라 ID · 선택')).not.toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: '세션 생성' }));

    const pairingCode = await screen.findByRole('status', { name: 'Quest pairing code' });
    expect(screen.getByRole('dialog', { name: 'Quest 연결' })).toBeInTheDocument();
    expect(pairingCode).toHaveTextContent(/^\d{6}$/u);
    expect(screen.getByText(/를 열고 아래 코드를 입력하세요/u)).toBeVisible();
    const pairing = await port.pairHumanDemonstrationSource({
      pairingCode: pairingCode.textContent ?? '',
      sourceDeviceId: 'quest2-001',
      integrationProfileId: 'quest-webxr-hand-pose-v1',
      capabilities: ['left-hand-pose', 'right-hand-pose'],
    });
    expect(await screen.findByRole('heading', { name: 'Quest 연결 완료' })).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Quest pairing code' })).not.toBeInTheDocument();
    await port.updateHumanDemonstrationSource(pairing.sessionId, pairing.sourceDeviceId, 'ready');
    expect(screen.queryByRole('region', { name: /미리보기/u })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '수집 콘솔 열기' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '사전점검 실행' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '장치 준비 상태' })).not.toBeInTheDocument();
    port.dispose();
  });

  it('Quest 사람 시연은 카메라와 손·전신·Head 인지 결과를 상세와 함께 표시한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanDemonstrationSession({
      projectId: 'project-tiger',
      siteId: 'site-lab',
      name: 'Quest hands only',
      taskId: 'task-sort',
      instruction: 'Sort objects',
      exoskeletonDeviceId: 'exoskeleton-001',
      questDeviceId: 'quest2-001',
      headCameraDeviceId: 'rbp-headcam-001',
      externalCameraDeviceId: 'external-camera-001',
    });

    render(
      <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
        <ToastProvider>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
            </Routes>
          </FlywheelContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Quest hands only' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Collector 열기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Quest pairing code' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '수집 작업 컨트롤' })).queryByRole('button', { name: 'Quest 연결' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '현재 문제와 조치' })).not.toBeInTheDocument();
    expect(screen.queryByText('저장 상태 확인 불가')).not.toBeInTheDocument();
    expect(screen.queryByText('데이터 품질')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '수집 상태' }));
    expect(within(screen.getByRole('region', { name: 'Quest 손 추적 장치' })).getByRole('button', { name: 'Quest 연결' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Quest 연결' }));
    const pairingDialog = screen.getByRole('dialog', { name: 'Quest 연결' });
    expect(within(pairingDialog).getByRole('region', { name: 'Quest 연결' })).toHaveTextContent('Quest 브라우저에서 /collect/quest를 열고 아래 코드를 입력하세요.');
    await user.click(within(pairingDialog).getByRole('button', { name: '닫기' }));
    expect(screen.getByRole('button', { name: 'Quest 연결' })).toHaveFocus();
    const preview = screen.getByRole('region', { name: '실시간 수집 모니터' });
    expect(preview).toHaveClass('collection-visual-grid');
    expect(await within(preview).findByRole('region', { name: '전신 휴머노이드 3D' })).toBeVisible();
    expect(within(preview).getByRole('region', { name: 'Head RGB Depth와 세그멘테이션' })).toBeVisible();
    expect(await within(preview).findByRole('region', { name: 'Quest 손 포즈 3D' })).toBeVisible();
    expect(within(preview).getByRole('region', { name: '전신 휴머노이드 3D' }).querySelector('model-viewer'))
      .toHaveAttribute('src', '/assets/unitree-g1.glb');
    await user.click(screen.getByRole('tab', { name: '세션 정보' }));
    const sessionInfo = screen.getByRole('region', { name: '세션 정보' });
    expect(within(sessionInfo).queryByText('Collector 명령 응답')).not.toBeInTheDocument();
    for (const value of ['사람 시연', 'exoskeleton-001', 'quest2-001', 'rbp-headcam-001', 'external-camera-001', '시작 전']) {
      expect(within(sessionInfo).getByText(value)).toBeVisible();
    }
    await user.click(screen.getByRole('tab', { name: '수집 상태' }));
    const sources = screen.getByRole('region', { name: 'Sensor stream 상태' });
    expect(within(sources).getAllByText('quest2-001').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Collector 명령 응답' })).not.toBeInTheDocument();
    expect(screen.queryByText('Episode command 대기 중')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '수집 상태' })).not.toBeInTheDocument();
    expect(preview).toBeVisible();
    expect(screen.getByRole('region', { name: '수집 작업 컨트롤' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '세션 정보' }));
    expect(screen.queryByRole('region', { name: 'Collector 명령 응답' })).not.toBeInTheDocument();
    port.dispose();
  });

  it('수집 상태는 이상 징후를 먼저 보여주고 수신 상세와 선택·파생 소스를 펼쳐 확인한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await port.createHumanDemonstrationSession({
        projectId: 'project-tiger', siteId: 'site-lab', name: '소스별 수신 확인',
        taskId: 'task-sort', instruction: 'Sort objects',
        exoskeletonDeviceId: 'exoskeleton-001', questDeviceId: 'quest2-001',
        headCameraDeviceId: 'rbp-headcam-001', externalCameraDeviceId: 'external-camera-001',
      });
      const snapshot = await port.getCollectionTelemetry(session.id);
      if (snapshot === null) throw new Error('Missing telemetry fixture');
      vi.spyOn(port, 'getCollectionTelemetry').mockResolvedValue({
        ...snapshot, observedAtMs: Date.now(),
        streams: snapshot.streams.map((stream) => ({
          ...stream,
          droppedFrameCount: stream.streamId === 'quest-hand-left' ? 3 : 0,
          missingSampleCount: stream.streamId === 'quest-hand-left' ? 7 : 0,
          lastSampleAtMs: stream.streamId === 'quest-hand-left' ? Date.now() : null,
          driftMs: stream.streamId === 'quest-hand-left' ? 37 : null,
          handTracking: stream.streamId === 'quest-hand-left' ? {
            qualityState: 'lost', poseObserved: false, sourcePresent: true,
            consecutiveMissingMs: 500, validJointCount: 0,
          } : null,
        })),
        sync: { ...snapshot.sync, state: 'out-of-sync', toleranceMs: 20, maxDriftMs: 37 },
        timeline: {
          windowMs: 10_000,
          tracks: [{
            streamId: 'quest-hand-left', label: 'Left Hand Pose · Quest', health: 'degraded',
            anomalies: [{ startOffsetMs: -2_000, endOffsetMs: -1_000, kind: 'missing', severity: 'warning', label: '왼손 샘플 누락' }],
          }],
        },
      });
      render(
        <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
          <FlywheelContext.Provider value={port}>
            <Routes><Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" /></Routes>
          </FlywheelContext.Provider>
        </MemoryRouter>,
      );
      await screen.findByRole('heading', { name: '소스별 수신 확인' });
      await user.click(screen.getByRole('tab', { name: '수집 상태' }));
      const sources = screen.getByRole('region', { name: 'Sensor stream 상태' });
      expect(within(sources).getByText('최대 시간 차이 37.0 ms · 허용 20 ms')).toBeVisible();
      const drift = within(sources).getByText('시간 차이 37.0 ms');
      expect(drift).not.toBeVisible();
      expect(within(sources).getByText('시간 차이 37.0 ms · 허용 범위 초과')).toBeVisible();
      const disclosure = drift.closest('details') as HTMLDetailsElement;
      await user.click(within(disclosure).getByLabelText('Left Hand Pose · Quest 수신 상세'));
      expect(drift).toHaveClass('text-warning');
      expect(drift).toBeVisible();
      expect(within(drift.parentElement as HTMLElement).getByRole('img', { name: /최근 10초 수신 기록 · 왼손 샘플 누락/u })).toBeVisible();
      expect(within(sources).getAllByText('시간 차이 확인 전').length).toBeGreaterThan(0);
      expect(within(sources).getByText(/프레임 손실 3 · 샘플 누락 7/u)).toBeVisible();
      expect(within(sources).getByText(/유효 관절 0\/25 · 연속 누락 500 ms/u)).toBeVisible();
      expect(within(sources).queryByRole('button', { name: /전체 소스 상세/u })).not.toBeInTheDocument();
      for (const group of [
        { label: '선택 소스', streams: snapshot.streams.filter((stream) => !stream.required && stream.origin !== 'derived') },
        { label: '파생 데이터', streams: snapshot.streams.filter((stream) => stream.origin === 'derived') },
      ]) {
        for (const stream of group.streams) expect(within(sources).getByText(stream.displayName)).not.toBeVisible();
        await user.click(within(sources).getByText(`${group.label} ${String(group.streams.length)}`));
        for (const stream of group.streams) expect(within(sources).getByText(stream.displayName)).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      }
      for (const stream of snapshot.streams) {
        expect(within(sources).getAllByText(stream.displayName)).toHaveLength(1);
      }
      expect(screen.getByRole('region', { name: '실시간 수집 카메라' })).toBeVisible();
    } finally {
      port.dispose();
    }
  });

  it.each(['waiting', 'empty'] as const)('수집 소스가 없으면 펼칠 항목 없이 상태를 안내한다: %s', async (state) => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await port.createHumanoidSession({
        instruction: 'Sort objects', name: '수신 대기', projectId: 'project-tiger',
        robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
      });
      const snapshot = await port.getCollectionTelemetry(session.id);
      if (snapshot === null) throw new Error('Missing telemetry fixture');
      vi.spyOn(port, 'getCollectionTelemetry').mockResolvedValue(state === 'waiting' ? null : { ...snapshot, streams: [] });
      render(
        <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
          <FlywheelContext.Provider value={port}>
            <Routes><Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" /></Routes>
          </FlywheelContext.Provider>
        </MemoryRouter>,
      );
      await screen.findByRole('heading', { name: '수신 대기' });
      await user.click(screen.getByRole('tab', { name: '수집 상태' }));
      const sources = screen.getByRole('region', { name: 'Sensor stream 상태' });
      expect(within(sources).getByText(state === 'waiting'
        ? '장치의 수신 상태를 기다리고 있습니다.'
        : '필수 수집 소스가 없습니다. 세션의 장치 구성을 확인하세요.')).toBeVisible();
      expect(sources.querySelector('details')).toBeNull();
      expect(within(sources).queryByRole('button')).not.toBeInTheDocument();
    } finally {
      port.dispose();
    }
  });

  it('사전점검을 통과해야 첫 Episode 녹화를 시작할 수 있다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanoidSession({
      instruction: 'Sort objects', name: 'single action recording', projectId: 'project-tiger',
      robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
    });

    render(
      <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
        <ToastProvider>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
            </Routes>
          </FlywheelContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );

    const controls = await screen.findByRole('region', { name: '수집 작업 컨트롤' });
    expect(within(controls).queryByRole('status', { name: '현재 수집 상태' }))
      .not.toBeInTheDocument();
    expect(document.querySelector('[data-preview-workspace]'))
      .not.toHaveAttribute('data-recording-tally');
    expect(within(controls).queryByRole('button', { name: '사전점검 실행' }))
      .not.toBeInTheDocument();
    const record = await within(controls).findByRole('button', { name: 'Episode 녹화 시작' });
    expect(await port.getSession(session.id)).toMatchObject({ status: 'ready' });
    await user.click(record);

    await waitFor(async () => {
      const started = await port.getSession(session.id);
      expect(started?.status).toBe('active');
      expect(started?.kind === 'humanoid' ? started.activeEpisodeId : null).not.toBeNull();
    });
    expect(within(controls).getByRole('button', { name: 'Episode 녹화 정지' })).toBeVisible();
    port.dispose();
  });

  it('Episode를 정지한 뒤 현재 녹화본을 저장하거나 폐기 후 재녹화한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanoidSession({
      instruction: 'Sort objects', name: 'review episode', projectId: 'project-tiger',
      robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);

    render(
      <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
        <ToastProvider>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
            </Routes>
          </FlywheelContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );

    const recordingControls = await screen.findByRole('region', { name: '수집 작업 컨트롤' });
    expect(screen.getByRole('region', { name: '세션 정보' })).toBeVisible();
    expect(within(recordingControls).getByRole('button', { name: 'Episode 녹화 정지' })).toBeVisible();
    expect(within(recordingControls).queryByRole('button', { name: 'Episode 삭제' }))
      .not.toBeInTheDocument();
    await user.click(within(recordingControls).getByRole('button', { name: 'Episode 녹화 정지' }));
    const playbackControls = await screen.findByRole('group', { name: 'Episode 재생 컨트롤' });
    const workflowControls = screen.getByRole('region', { name: '수집 작업 컨트롤' });
    const saveRecording = within(workflowControls).getByRole('button', { name: '녹화본 저장' });
    const discardAndRecordAgain = within(workflowControls).getByRole('button', { name: '다시 녹화' });
    expect(discardAndRecordAgain.querySelector('svg')).toHaveClass('lucide-rotate-ccw');
    expect(discardAndRecordAgain.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    expect(await port.getSession(session.id)).toMatchObject({ activeEpisodeId: episode.id });
    expect(screen.getByRole('status', { name: '현재 수집 상태' }))
      .toHaveTextContent('검토 중');
    expect(screen.getByRole('region', { name: '수집 작업 컨트롤' })).toHaveAttribute('data-collection-state', 'review');
    expect(document.querySelector('[data-preview-workspace]'))
      .not.toHaveAttribute('data-recording-tally');
    expect(within(workflowControls).queryByText('녹화본 확인')).not.toBeInTheDocument();
    expect(workflowControls).toHaveTextContent(`${episode.name} · 검토 중`);
    expect(document.querySelector('[data-capture-viewport]')?.nextElementSibling)
      .toBe(workflowControls);
    expect(workflowControls).toHaveAttribute('data-collection-state', 'review');
    expect(saveRecording).toBeVisible();
    expect(discardAndRecordAgain).toBeVisible();
    expect(discardAndRecordAgain).toHaveClass('bg-action-secondary');
    expect(saveRecording.parentElement).toHaveAttribute('data-cycle-control-anchor');
    expect(discardAndRecordAgain.closest('[data-cycle-control-anchor]')).toBeInTheDocument();
    expect(within(workflowControls).queryByRole('group', { name: 'Episode 재생 컨트롤' }))
      .not.toBeInTheDocument();
    expect(playbackControls.closest('[data-preview-workspace]')).toBeInTheDocument();
    expect(within(playbackControls).queryByRole('button', { name: '녹화본 저장' }))
      .not.toBeInTheDocument();
    expect(within(workflowControls).queryByRole('button', { name: '재생' })).not.toBeInTheDocument();
    expect(within(playbackControls).getByRole('status')).toHaveTextContent('일시 정지됨');

    const playButton = within(playbackControls).getByRole('button', { name: '재생' });
    expect(playButton).toHaveAttribute('aria-pressed', 'false');
    await user.click(playButton);
    const pauseButton = within(playbackControls).getByRole('button', { name: '일시정지' });
    expect(pauseButton).toHaveAttribute('aria-pressed', 'true');
    expect(within(playbackControls).getByRole('status')).toHaveTextContent('재생 중');
    await user.click(pauseButton);
    expect(within(playbackControls).getByRole('button', { name: '재생' }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(within(playbackControls).getByRole('status')).toHaveTextContent('일시 정지됨');
    expect(within(playbackControls).queryByRole('button', { name: '다시 보기' }))
      .not.toBeInTheDocument();
    const recordedCameras = screen.getByRole('region', { name: '기록된 Episode 카메라' });
    expect(within(recordedCameras).getAllByRole('status', { name: '기록 영상' })).toHaveLength(3);
    expect(screen.getAllByText('기록')).toHaveLength(3);

    await user.click(discardAndRecordAgain);
    expect(screen.getByRole('dialog')).toHaveTextContent('이 녹화본을 삭제하고 다시 녹화할까요?');
    await user.click(screen.getByRole('button', { name: '녹화본 계속 확인' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(discardAndRecordAgain).toHaveFocus();

    await user.click(discardAndRecordAgain);
    await user.click(screen.getByRole('button', { name: '삭제하고 다시 녹화' }));
    let retryEpisodeId = '';
    await waitFor(async () => {
      expect(await port.getEpisode(episode.id)).toBeNull();
      const updatedSession = await port.getSession(session.id);
      expect(updatedSession?.kind).toBe('humanoid');
      if (updatedSession?.kind !== 'humanoid') return;
      expect(updatedSession.activeEpisodeId).not.toBeNull();
      retryEpisodeId = updatedSession.activeEpisodeId ?? '';
      expect(retryEpisodeId).not.toBe(episode.id);
      expect(await port.getEpisode(retryEpisodeId)).toMatchObject({ status: 'recording' });
    });

    const retryControls = await screen.findByRole('region', { name: '수집 작업 컨트롤' });
    expect(retryControls).toHaveAttribute('data-collection-state', 'recording');
    await user.click(within(retryControls).getByRole('button', { name: 'Episode 녹화 정지' }));
    await user.click(await screen.findByRole('button', { name: '녹화본 저장' }));
    await waitFor(async () => {
      expect(await port.getEpisode(retryEpisodeId)).toMatchObject({
        outcome: null,
        status: 'completed',
      });
      expect(await port.getSession(session.id)).toMatchObject({ activeEpisodeId: null });
    });
    const startControls = await screen.findByRole('region', { name: '수집 작업 컨트롤' });
    const startRecording = within(startControls).getByRole('button', {
      name: '다음 Episode 녹화 시작',
    });
    expect(startRecording).toBeVisible();
    expect(within(startControls).getByText('저장 완료 1개')).toBeVisible();
    expect(startControls).toHaveTextContent('녹화 준비 완료');
    expect(startControls).not.toHaveTextContent('검토 중');
    expect(startRecording).not.toHaveClass('rounded-[var(--design-radius-round)]');
    expect(startRecording.querySelector('svg')).toBeInTheDocument();
    expect(startRecording).toHaveTextContent('다음 Episode 녹화 시작');
    expect(within(startControls).queryByRole('button', { name: '세션 저장하고 마치기' }))
      .not.toBeInTheDocument();
    const finishSession = screen.getByRole('button', { name: '수집 콘솔 닫기' });

    await user.click(finishSession);
    expect(screen.getByRole('dialog')).toHaveTextContent('세션을 저장하고 마칠까요?');
    expect(screen.getByRole('dialog')).toHaveTextContent('저장한 Episode 1개');
    expect(screen.getByRole('dialog')).toHaveTextContent('카탈로그 처리를 시작합니다.');
    await user.click(screen.getByRole('button', { name: '계속 수집' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(finishSession).toHaveFocus();
    port.dispose();
  });

  it('review 종료는 saveEpisode 다음 stopSession을 실행하고 중간 실패를 dialog에서 재시도한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_010_000 });
    const session = await port.createHumanoidSession({
      instruction: 'Sort objects', name: 'review close sequence', projectId: 'project-tiger',
      robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);
    await port.stopEpisode(episode.id);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const callOrder: string[] = [];
    const originalSaveEpisode = port.saveEpisode.bind(port);
    const originalStopSession = port.stopSession.bind(port);
    const saveSpy = vi.spyOn(port, 'saveEpisode').mockImplementation(async (episodeId) => {
      callOrder.push('saveEpisode');
      return originalSaveEpisode(episodeId);
    });
    const stopSpy = vi.spyOn(port, 'stopSession')
      .mockRejectedValueOnce(new Error('catalog gateway unavailable'))
      .mockImplementation(async (sessionId) => {
        callOrder.push('stopSession');
        return originalStopSession(sessionId);
      });

    render(
      <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
        <ToastProvider>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
              <Route element={<p>수집 세션 목록</p>} path="/mlops/collection" />
              <Route element={<p>저장된 세션 카탈로그</p>} path="/mlops/catalog/:collectionId" />
            </Routes>
          </FlywheelContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await screen.findByRole('group', { name: 'Episode 재생 컨트롤' });
    await user.click(screen.getByRole('button', { name: '수집 콘솔 닫기' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('녹화본을 저장하고 세션을 마칠까요?');
    await user.click(within(dialog).getByRole('button', { name: '녹화본 저장하고 마치기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('종료 작업을 완료하지 못했습니다. 원본 전송과 저장 상태를 확인하고 다시 시도하세요.');
    expect(screen.queryByText('catalog gateway unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['saveEpisode']);
    expect(await port.getSession(session.id)).toMatchObject({ status: 'active', activeEpisodeId: null });

    await user.click(screen.getByRole('button', { name: '저장하고 마치기' }));
    await waitFor(() => expect(stopSpy).toHaveBeenCalledTimes(2));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['saveEpisode', 'stopSession']);
    port.dispose();
  });

  it('저장된 Episode가 없는 세션의 나중에 계속은 세션을 확정하거나 삭제하지 않는다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanoidSession({
      instruction: 'Sort objects', name: 'preserved empty session', projectId: 'project-tiger',
      robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
    });

    render(
      <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
        <ToastProvider>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
              <Route element={<p>수집 세션 목록</p>} path="/mlops/collection" />
            </Routes>
          </FlywheelContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'preserved empty session' });
    await user.click(screen.getByRole('button', { name: '수집 콘솔 닫기' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('빈 세션을 확정하거나 데이터를 삭제하지 않습니다.');
    await user.click(screen.getByRole('button', { name: '나중에 계속' }));

    expect(await screen.findByText('수집 세션 목록')).toBeInTheDocument();
    expect(await port.getSession(session.id)).toMatchObject({ status: 'ready', startedAtMs: null, stoppedAtMs: null });
    port.dispose();
  });

  it('저장한 Episode를 확인한 뒤 세션을 저장하고 카탈로그로 이동한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const session = await port.createHumanoidSession({
      instruction: 'Sort objects', name: 'finish collection', projectId: 'project-tiger',
      robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
    });
    await port.validateSession(session.id);
    await port.startSession(session.id);
    const episode = await port.startEpisode(session.id);
    await port.completeEpisode(episode.id, 'success');

    render(
      <MemoryRouter initialEntries={[`/mlops/collection/${session.id}`]}>
        <ToastProvider>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
              <Route element={<p>저장된 세션 카탈로그</p>} path="/mlops/catalog/:collectionId" />
            </Routes>
          </FlywheelContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );

    const controls = await screen.findByRole('region', { name: '수집 작업 컨트롤' });
    expect(within(controls).queryByRole('button', { name: '세션 저장하고 마치기' }))
      .not.toBeInTheDocument();
    const finishSession = screen.getByRole('button', { name: '수집 콘솔 닫기' });
    await user.click(finishSession);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('세션을 저장하고 마칠까요?');
    expect(dialog).toHaveTextContent('저장한 Episode 1개');
    await user.click(within(dialog).getByRole('button', { name: '저장하고 마치기' }));

    await waitFor(async () => {
      expect((await port.getSession(session.id))?.status).toBe('processing');
    });
    expect(screen.getByRole('status', { name: '현재 수집 상태' }))
      .toHaveTextContent(/파일 확정 중|인덱스 생성 중/u);
    expect(controls)
      .toHaveAttribute('data-collection-state', 'processing');
    expect(controls)
      .toHaveTextContent(/세션 처리 중/u);
    expect(within(controls).queryByRole('button')).not.toBeInTheDocument();
    expect(await screen.findByText('저장된 세션 카탈로그')).toBeInTheDocument();
    expect((await port.getSession(session.id))?.status).toBe('completed');
    port.dispose();
  });

  it('운영 세션 목록에는 미완료 휴머노이드 세션만 상태 우선순위로 표시한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const draft = await port.createHumanoidSession({
      instruction: 'Sort objects',
      name: 'same robot draft',
      projectId: 'project-tiger',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      siteId: 'site-lab',
      taskId: 'task-sort',
    });
    const active = await port.createHumanoidSession({
      instruction: 'Stack objects',
      name: 'other robot active',
      projectId: 'project-tiger',
      robotId: 'robot-003',
      sensorDeviceId: 'sensor-rig-001',
      siteId: 'site-lab',
      taskId: 'task-stack',
    });
    await port.validateSession(active.id);
    await port.startSession(active.id);

    render(
      <MemoryRouter>
        <FlywheelContext.Provider value={port}>
          <CollectionWorkspacePage />
        </FlywheelContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '데이터 수집' })).toBeInTheDocument();
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('other robot active');
    expect(rows[2]).toHaveTextContent(draft.name);
    expect(screen.queryByText('mobility', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '새 수집' })).toHaveAttribute('href', '/mlops/collection/new');

    const activeRow = screen.getByText(active.name).closest('tr');
    expect(activeRow).toBeInstanceOf(HTMLElement);
    if (!(activeRow instanceof HTMLElement)) throw new Error('active row missing');
    expect(within(activeRow).getByRole('link', { name: active.name }))
      .toHaveAttribute('href', `/mlops/collection/${active.id}`);
    expect(within(activeRow).queryByText('수집 계속')).not.toBeInTheDocument();

    const draftRow = screen.getByText(draft.name).closest('tr');
    expect(draftRow).toBeInstanceOf(HTMLElement);
    if (!(draftRow instanceof HTMLElement)) throw new Error('draft row missing');
    await user.click(within(draftRow).getByRole('button', { name: `${draft.name} 더보기` }));
    await user.click(screen.getByRole('menuitem', { name: '세션 삭제' }));
    const deleteDialog = screen.getByRole('dialog');
    expect(within(deleteDialog).getByRole('button', { name: '취소' })).toBeInTheDocument();
    await user.click(within(deleteDialog).getByRole('button', { name: '세션 삭제' }));
    await waitFor(async () => {
      expect(await port.getSession(draft.id)).toBeNull();
    });
    port.dispose();
  });

  it('Backend 미구성 환경을 빈 세션으로 표시하지 않는다', async () => {
    const port = createUnavailableFlywheel();
    render(
      <MemoryRouter>
        <FlywheelContext.Provider value={port}>
          <CollectionWorkspacePage />
        </FlywheelContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '현재 사용할 수 없습니다' })).toBeInTheDocument();
    expect(screen.getByText('이 환경에서는 수집 장치에 연결할 수 없습니다. 관리자가 수집 서버 연결을 설정해야 합니다.')).toBeVisible();
    expect(screen.getByRole('button', { name: '새 수집' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: '진행 중인 수집이 없습니다' })).not.toBeInTheDocument();
    port.dispose();
  });

  it('같은 로봇의 세션 시작 충돌에서 사용 중인 세션 링크를 제공한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = (name: string) => port.createHumanoidSession({
      instruction: 'Sort objects',
      name,
      projectId: 'project-tiger',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      siteId: 'site-lab',
      taskId: 'task-sort',
    });
    const active = await create('active robot session');
    const blocked = await create('blocked robot session');
    await port.validateSession(active.id);
    await port.validateSession(blocked.id);
    await port.startSession(active.id);

    render(
      <MemoryRouter initialEntries={[`/mlops/collection/${blocked.id}`]}>
        <ToastProvider>
          <FlywheelContext.Provider value={port}>
            <Routes>
              <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
            </Routes>
          </FlywheelContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );
    const recordingControls = await screen.findByRole('region', { name: '수집 작업 컨트롤' });
    expect(screen.queryByText('현재 작업', { exact: true })).not.toBeInTheDocument();
    await user.click(within(recordingControls).getByRole('button', { name: 'Episode 녹화 시작' }));

    await user.click(await screen.findByRole('tab', { name: /^문제 · \d+$/u }));
    const conflictLink = await screen.findByRole('link', { name: '사용 중인 세션 열기' });
    expect(conflictLink).toHaveAttribute('href', `/mlops/collection/${active.id}`);
    expect(conflictLink.closest('[role="alert"]')).toHaveTextContent('다른 세션에서 수집 장치를 사용 중입니다.');
    port.dispose();
  });

  it('카탈로그 상세에서 저장한 Episode만 Dataset 후보로 전달한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    render(
      <MemoryRouter initialEntries={['/mlops/catalog/capture-h-001']}>
        <FlywheelContext.Provider value={port}>
          <Routes>
            <Route element={<CatalogDetailPage />} path="/mlops/catalog/:collectionId" />
            <Route element={<p>Dataset 생성 화면</p>} path="/mlops/datasets/new" />
          </Routes>
        </FlywheelContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Desktop sorting batch' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Pick and place · 01 선택' }));
    expect(screen.queryByRole('checkbox', { name: 'Pick and place · 02 선택' }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '선택한 에피소드 1개로 데이터셋 구성' }));
    expect(screen.getByText('Dataset 생성 화면')).toBeInTheDocument();
    port.dispose();
  });

  it('카탈로그를 확인 후 삭제하고 Dataset 참조 Episode는 유지한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    render(
      <MemoryRouter>
        <FlywheelContext.Provider value={port}>
          <CatalogPage />
        </FlywheelContext.Provider>
      </MemoryRouter>,
    );

    const catalogName = await screen.findByText('Desktop sorting batch');
    const catalogRow = catalogName.closest('tr');
    expect(catalogRow).toBeInstanceOf(HTMLElement);
    if (!(catalogRow instanceof HTMLElement)) throw new Error('catalog row missing');
    await user.click(within(catalogRow).getByRole('button', { name: '삭제' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('기존 데이터셋이 참조하는 에피소드는 보존됩니다.');
    await user.click(screen.getByRole('button', { name: '카탈로그 삭제' }));

    await waitFor(async () => {
      expect(await port.getCatalogCollection('capture-h-001')).toBeNull();
    });
    expect(await port.getEpisode('episode-fw-001')).not.toBeNull();
    port.dispose();
  });
});
