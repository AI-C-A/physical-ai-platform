import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext, type FlywheelPort } from '@/entities/flywheel';
import { deriveRoomCode } from '@/entities/simulation-collection';
import { BrandingContext } from '@/shared/config';

import { HumanoidCollectionDetailPage } from './FlywheelWorkspacePages';
import { SimulationCollectionPage } from './SimulationCollectionPage';

const SIMULATION_ORIGIN = 'https://orca.tail58a6fa.ts.net';

function post(data: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'aaf-monitor', t: 'snapshot', ...data }, origin: SIMULATION_ORIGIN }));
  });
}

function CurrentLocation() {
  const location = useLocation();
  return <output aria-label="현재 경로">{location.pathname}{location.search}</output>;
}

function renderPage(port: FlywheelPort, path: string) {
  return render(
    <BrandingContext.Provider value={{ productName: 'ROBOT Army TIGER+', shortName: 'ROBOT Army TIGER+', logo: '/assets/army-tiger-logo.png' }}>
      <MemoryRouter initialEntries={[path]}>
        <FlywheelContext.Provider value={port}>
          <CurrentLocation />
          <Routes>
            <Route element={<SimulationCollectionPage />} path="/mlops/collection/:sessionId/simulation" />
            <Route element={<HumanoidCollectionDetailPage />} path="/mlops/collection/:sessionId" />
            <Route element={<h1>수집 목록으로 이동 완료</h1>} path="/mlops/collection" />
          </Routes>
        </FlywheelContext.Provider>
      </MemoryRouter>
    </BrandingContext.Provider>,
  );
}

async function createSession(port: FlywheelPort) {
  return port.createHumanoidSession({
    instruction: '시뮬레이션에서 무전기를 준비한다', name: '휴머노이드 수집 09. 14.', projectId: 'project-tiger',
    robotId: 'robot-003', sensorDeviceId: 'sensor-rig-001', siteId: 'pangyo-outdoor-zone', taskId: 'task-sim',
  });
}

describe('SimulationCollectionPage', () => {
  afterEach(() => {
    // 훅이 등록한 message 리스너는 언마운트에서 정리되지만, 방어적으로 idle 상태를 남긴다.
  });

  it('세션 코드로 관전 시뮬레이션을 띄우고 VR 접속 안내를 보여준다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      const code = deriveRoomCode(session.id);
      renderPage(port, `/mlops/collection/${session.id}/simulation?siteId=pangyo-outdoor-zone`);
      expect(await screen.findByRole('heading', { name: /휴머노이드 수집 09\. 14\./u })).toHaveTextContent('시뮬레이션 수집');
      const stage = screen.getByTitle('시뮬레이션 화면');
      expect(stage).toHaveAttribute('src', `${SIMULATION_ORIGIN}/?room=${code}&name=MONITOR&spectate=1`);
      expect(stage).toHaveAttribute('allow', expect.stringContaining('xr-spatial-tracking'));
      const connect = screen.getByRole('region', { name: 'VR 접속 안내' });
      expect(within(connect).getByLabelText('방 코드')).toHaveTextContent(code);
      expect(within(connect).getByLabelText('헤드셋 접속 주소')).toHaveTextContent(`${SIMULATION_ORIGIN}/?room=${code}`);
      expect(within(connect).getByRole('link', { name: 'PC로도 참가' })).toHaveAttribute('href', `${SIMULATION_ORIGIN}/?room=${code}&name=PC`);
      expect(screen.getByRole('link', { name: '수집 콘솔로 돌아가기' })).toHaveAttribute('href', `/mlops/collection/${session.id}?siteId=pangyo-outdoor-zone`);
      // 코드는 세션마다 결정적이며 헷갈리는 글자를 쓰지 않는다.
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRTUVWXY2346789]{6}$/u);
    } finally { port.dispose(); }
  });

  it('iframe 브리지 스냅샷으로 참가자·임무·이벤트를 실시간으로 보여준다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}/simulation`);
      await screen.findByTitle('시뮬레이션 화면');
      const panel = screen.getByRole('region', { name: '실시간 수집 데이터' });
      expect(within(panel).getByText('시뮬레이션 화면이 연결되면 참가자와 수집 상황이 표시됩니다.')).toBeVisible();

      post({
        mode: 'desktop', recording: true,
        stats: { frames: 362, events: 11, tracked: 38, episodes: 0, duration: 15.8 },
        peers: [{ name: 'OP-11', mode: 'vr' }],
        head: [0, 1.6, -2], heldCount: 1,
        hands: [{ id: 'right', kind: 'hand', p: [0.3, 1.1, -1.8], grab: true, joints: null }],
        task: { id: 't01_radio', title: '전술 무전기 준비', index: 1, par: 40, tier: 0, time: 15.8, hint: '안테나를 세워 정렬해 끼우십시오', steps: [{ label: '배터리를 무전기에 삽입', state: 'done' }, { label: '안테나 체결', state: 'active' }] },
        events: [{ seq: 1, name: 'grasp', data: { tag: 'radio_antenna' } }, { seq: 2, name: 'snap', data: { tag: 'radio_antenna', zone: 'radio_antenna_port' } }],
      });

      expect(await within(panel).findByText('참가자 1명 · OP-11 (VR)')).toBeVisible();
      expect(within(panel).getByText('MISSION 01 · 전술 무전기 준비')).toBeVisible();
      expect(within(panel).getByText('15.8s / 목표 40s')).toBeVisible();
      expect(within(panel).getByText('안테나를 세워 정렬해 끼우십시오')).toBeVisible();
      expect(within(panel).getByText('오른손')).toBeVisible();
      expect(within(panel).getByText('핸드트래킹 · 잡는 중')).toBeVisible();
      expect(within(panel).getByRole('log')).toHaveTextContent('radio_antenna → radio_antenna_port 결합');
      const stats = within(panel).getByLabelText('수집 통계');
      expect(within(stats).getByText('프레임').nextElementSibling).toHaveTextContent('362');
      expect(within(stats).getByText('이벤트').nextElementSibling).toHaveTextContent('11');
      expect(within(stats).getByText('추적 물체').nextElementSibling).toHaveTextContent('38');
      expect(screen.getByText('OP-11 작업 중')).toBeVisible();
    } finally { port.dispose(); }
  });

  it('타일을 크게 보고 다른 화면으로 전환한 뒤 원래대로 되돌린다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}/simulation`);
      await screen.findByTitle('시뮬레이션 화면');
      const dataRegion = screen.getByRole('region', { name: '실시간 수집 데이터' });
      const stageRegion = screen.getByRole('region', { name: '시뮬레이션 · 판교 정비창' });
      expect(dataRegion).toBeVisible();

      await user.click(screen.getByRole('button', { name: '시뮬레이션 · 판교 정비창 크게 보기' }));
      expect(dataRegion).not.toBeVisible();
      // 최대화 중에도 데이터 타일은 언마운트되지 않는다(스트림 유지).
      expect(dataRegion).toBeInTheDocument();

      const rail = screen.getByRole('group', { name: '화면 전환' });
      await user.click(within(rail).getByRole('button', { name: '실시간 수집 데이터' }));
      expect(dataRegion).toBeVisible();
      expect(stageRegion).not.toBeVisible();
      expect(stageRegion).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '실시간 수집 데이터 원래대로' }));
      expect(screen.getByRole('region', { name: '시뮬레이션 · 판교 정비창' })).toBeVisible();
      expect(screen.getByRole('region', { name: '실시간 수집 데이터' })).toBeVisible();
    } finally { port.dispose(); }
  });

  it('타일을 숨겼다가 숨긴 화면 바에서 다시 불러온다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}/simulation`);
      await screen.findByTitle('시뮬레이션 화면');
      const dataRegion = screen.getByRole('region', { name: '실시간 수집 데이터' });
      expect(dataRegion).toBeVisible();

      await user.click(screen.getByRole('button', { name: '실시간 수집 데이터 숨기기' }));
      expect(dataRegion).not.toBeVisible();
      // 숨겨도 언마운트되지 않아 스트림이 유지된다.
      expect(dataRegion).toBeInTheDocument();

      const bar = screen.getByRole('group', { name: '숨긴 화면' });
      await user.click(within(bar).getByRole('button', { name: '실시간 수집 데이터 다시 보기' }));
      expect(screen.getByRole('region', { name: '실시간 수집 데이터' })).toBeVisible();
      expect(screen.queryByRole('group', { name: '숨긴 화면' })).not.toBeInTheDocument();
    } finally { port.dispose(); }
  });

  it('방 코드를 바꾸면 주소·iframe·코드가 함께 바뀐다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}/simulation`);
      await screen.findByTitle('시뮬레이션 화면');
      const connect = screen.getByRole('region', { name: 'VR 접속 안내' });
      const roomInput = within(connect).getByRole('textbox', { name: '방 코드 바꾸기' });
      await user.clear(roomInput);
      await user.type(roomInput, 'DEMOA');
      await user.click(within(connect).getByRole('button', { name: '적용' }));
      expect(screen.getByLabelText('현재 경로')).toHaveTextContent(`/mlops/collection/${session.id}/simulation?room=DEMOA`);
      expect(within(connect).getByLabelText('방 코드')).toHaveTextContent('DEMOA');
      expect(screen.getByTitle('시뮬레이션 화면')).toHaveAttribute('src', `${SIMULATION_ORIGIN}/?room=DEMOA&name=MONITOR&spectate=1`);
    } finally { port.dispose(); }
  });

  it('다른 origin의 message는 무시한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}/simulation`);
      await screen.findByTitle('시뮬레이션 화면');
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { source: 'aaf-monitor', t: 'snapshot', peers: [{ name: 'HACKER', mode: 'vr' }], stats: { frames: 9, events: 9, tracked: 9, episodes: 0, duration: 0 }, hands: [], events: [] },
          origin: 'https://evil.example',
        }));
      });
      const panel = screen.getByRole('region', { name: '실시간 수집 데이터' });
      expect(within(panel).getByText('시뮬레이션 화면이 연결되면 참가자와 수집 상황이 표시됩니다.')).toBeVisible();
      expect(within(panel).queryByText(/HACKER/u)).not.toBeInTheDocument();
    } finally { port.dispose(); }
  });

  it('없는 세션은 수집 목록으로 보낸다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      renderPage(port, '/mlops/collection/missing-session/simulation');
      expect(await screen.findByRole('heading', { name: '수집 목록으로 이동 완료' })).toBeVisible();
    } finally { port.dispose(); }
  });

  it('수집 콘솔의 장치 탭에서 시뮬레이션 수집 화면으로 이동한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}?siteId=pangyo-outdoor-zone`);
      await screen.findByRole('button', { name: '수집 콘솔 닫기' });
      const devicesTab = screen.getByRole('tab', { name: '장치' });
      if (devicesTab.getAttribute('aria-selected') !== 'true') await user.click(devicesTab);
      const section = screen.getByRole('region', { name: '시뮬레이션 수집' });
      const link = within(section).getByRole('link', { name: '시뮬레이션 수집' });
      expect(link).toHaveAttribute('href', `/mlops/collection/${session.id}/simulation?siteId=pangyo-outdoor-zone`);
      await user.click(link);
      expect(await screen.findByTitle('시뮬레이션 화면')).toBeInTheDocument();
      expect(screen.getByLabelText('현재 경로')).toHaveTextContent(`/mlops/collection/${session.id}/simulation?siteId=pangyo-outdoor-zone`);
    } finally { port.dispose(); }
  });
});
