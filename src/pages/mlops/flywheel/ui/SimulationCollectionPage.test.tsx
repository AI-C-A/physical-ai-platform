import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext, type FlywheelPort } from '@/entities/flywheel';
import { BrandingContext } from '@/shared/config';

import { HumanoidCollectionDetailPage } from './FlywheelWorkspacePages';
import { SimulationCollectionPage } from './SimulationCollectionPage';

const ORIGIN = 'https://orca.tail58a6fa.ts.net';
const CODE = '48213';

/** 릴레이를 흉내내는 소켓: hello에 welcome을, new_code에 5자리 코드를 즉시 돌려준다. */
class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    // useSyncExternalStore가 렌더 중 구독하므로, 마이크로태스크로 열어 act가 감싸게 한다.
    queueMicrotask(() => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.(); } });
  }

  send(data: string): void {
    const msg = JSON.parse(data) as { t?: string };
    if (msg.t === 'hello') this.#emit({ t: 'welcome', id: 'm', room: 'main', code: null, publicUrl: ORIGIN, peers: [] });
    else if (msg.t === 'new_code') this.#emit({ t: 'code', code: CODE });
  }

  #emit(obj: unknown): void { this.onmessage?.({ data: JSON.stringify(obj) } as MessageEvent<unknown>); }

  close(): void { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
}

function bridge(data: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'aaf-monitor', t: 'snapshot', ...data }, origin: ORIGIN }));
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
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('릴레이 코드를 발급받아 안내에 표시하고, 같은 코드 방으로 관전 iframe을 연다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}/simulation?siteId=pangyo-outdoor-zone`);
      expect(await screen.findByRole('heading', { name: /휴머노이드 수집 09\. 14\./u })).toHaveTextContent('시뮬레이션 수집');

      // 코드가 오면 iframe이 그 코드 방으로 열린다(헤드셋과 동일한 방).
      const stage = await screen.findByTitle('시뮬레이션 화면');
      expect(stage).toHaveAttribute('src', `${ORIGIN}/?code=${CODE}&spectate=1&name=MONITOR`);
      expect(stage).toHaveAttribute('allow', expect.stringContaining('xr-spatial-tracking'));

      const connect = screen.getByRole('region', { name: 'VR 접속 안내' });
      expect(within(connect).getByLabelText('인증 코드')).toHaveTextContent(CODE);
      expect(within(connect).getByLabelText('헤드셋 접속 주소')).toHaveTextContent(`${ORIGIN}/?code=${CODE}`);
      expect(within(connect).getByRole('link', { name: 'PC로도 참가' })).toHaveAttribute('href', `${ORIGIN}/?code=${CODE}&name=PC`);
      expect(screen.getByText(CODE, { selector: '.font-mono' })).toBeVisible();
      expect(screen.getByRole('link', { name: '수집 콘솔로 돌아가기' })).toHaveAttribute('href', `/mlops/collection/${session.id}?siteId=pangyo-outdoor-zone`);
    } finally { port.dispose(); }
  });

  it('iframe 브리지 스냅샷으로 참가자·임무·이벤트를 실시간으로 보여준다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}/simulation`);
      await screen.findByTitle('시뮬레이션 화면');
      const panel = screen.getByRole('region', { name: '실시간 수집 데이터' });

      bridge({
        mode: 'vr', recording: true,
        stats: { frames: 362, events: 11, tracked: 38, episodes: 0, duration: 15.8 },
        peers: [{ name: 'OP-11', mode: 'vr' }],
        head: [0, 1.6, -2], heldCount: 1,
        hands: [{ id: 'right', kind: 'hand', p: [0.3, 1.1, -1.8], grab: true, joints: null }],
        task: { id: 't01_radio', title: '전술 무전기 준비', index: 1, par: 40, tier: 0, time: 15.8, hint: '안테나 정렬', steps: [{ label: '배터리 삽입', state: 'done' }, { label: '안테나 체결', state: 'active' }] },
        events: [{ seq: 1, name: 'grasp', data: { tag: 'radio_antenna' } }, { seq: 2, name: 'snap', data: { tag: 'radio_antenna', zone: 'radio_antenna_port' } }],
      });

      expect(await within(panel).findByText('참가자 1명 · OP-11 (VR)')).toBeVisible();
      expect(within(panel).getByText('MISSION 01 · 전술 무전기 준비')).toBeVisible();
      expect(within(panel).getByText('오른손')).toBeVisible();
      expect(within(panel).getByText('핸드트래킹 · 잡는 중')).toBeVisible();
      expect(within(panel).getByRole('log')).toHaveTextContent('radio_antenna → radio_antenna_port 결합');
      const stats = within(panel).getByLabelText('수집 통계');
      expect(within(stats).getByText('프레임').nextElementSibling).toHaveTextContent('362');
      expect(screen.getByText('OP-11 작업 중')).toBeVisible();
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
      expect(dataRegion).toBeInTheDocument();
      const bar = screen.getByRole('group', { name: '숨긴 화면' });
      await user.click(within(bar).getByRole('button', { name: '실시간 수집 데이터 다시 보기' }));
      expect(screen.getByRole('region', { name: '실시간 수집 데이터' })).toBeVisible();
    } finally { port.dispose(); }
  });

  it('타일을 크게 보고 전환한 뒤 원래대로 되돌린다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await createSession(port);
      renderPage(port, `/mlops/collection/${session.id}/simulation`);
      await screen.findByTitle('시뮬레이션 화면');
      const dataRegion = screen.getByRole('region', { name: '실시간 수집 데이터' });
      await user.click(screen.getByRole('button', { name: '시뮬레이션 · 판교 정비창 크게 보기' }));
      expect(dataRegion).not.toBeVisible();
      const rail = screen.getByRole('group', { name: '화면 전환' });
      await user.click(within(rail).getByRole('button', { name: '실시간 수집 데이터' }));
      expect(dataRegion).toBeVisible();
      await user.click(screen.getByRole('button', { name: '실시간 수집 데이터 원래대로' }));
      expect(screen.getByRole('region', { name: '시뮬레이션 · 판교 정비창' })).toBeVisible();
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
