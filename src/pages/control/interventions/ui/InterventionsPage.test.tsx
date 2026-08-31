import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInMemoryInterventionRequests,
  InMemoryInterventionQueue,
  InterventionQueueContext,
} from '@/entities/intervention';
import { ClockContext, type ClockPort } from '@/shared/lib/clock';
import { ToastProvider } from '@/shared/ui/toast';

import { InterventionsPage } from './InterventionsPage';

const nowMs = Date.parse('2026-08-30T01:00:00Z');

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="현재 경로">{location.pathname}{location.search}</output>;
}

function renderPage(
  clock: ClockPort = { nowMs: () => nowMs },
  initialEntry = '/control/interventions',
) {
  const queue = new InMemoryInterventionQueue(
    createInMemoryInterventionRequests(clock),
  );
  const view = render(
    <ClockContext.Provider value={clock}>
      <InterventionQueueContext.Provider value={queue}>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route
                element={(
                  <>
                    <InterventionsPage />
                    <LocationProbe />
                  </>
                )}
                path="/control/interventions"
              />
              <Route
                element={<LocationProbe />}
                path="/control/monitoring/:robotId"
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </InterventionQueueContext.Provider>
    </ClockContext.Provider>,
  );
  return { ...view, queue };
}

afterEach(() => vi.useRealTimers());

describe('InterventionsPage', () => {
  it('판단 정보만 명확한 위계로 표시한다', async () => {
    const { container } = renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: '개입 요청' }))
      .toBeInTheDocument();

    const requestGrid = screen.getByRole('region', { name: '개입 요청 목록' });
    const requestCards = screen.getAllByRole('article');

    expect(requestGrid).toHaveClass(
      'grid',
      'min-w-0',
      'w-full',
      'grid-cols-1',
      'lg:grid-cols-2',
      '2xl:grid-cols-3',
    );
    expect(requestCards).toHaveLength(2);
    expect(requestCards[0]).not.toHaveClass('flex-[1_1_28rem]');
    expect(within(requestCards[0]!).getByText('순찰로 진입 인원 확인'))
      .toBeInTheDocument();
    expect(within(requestCards[1]!).getByText('우회 경로 확인'))
      .toBeInTheDocument();
    expect(screen.queryByText('파지 대상을 선택해 주세요')).not.toBeInTheDocument();
    expect(screen.queryByText('작업 로봇 05')).not.toBeInTheDocument();

    expect(screen.getAllByText(/이슈 발생/u)).toHaveLength(2);

    const situationSummary = screen.getByText(
      '전방 보급 통로에 군용 수송 케이스가 쏟아져 로봇이 자율 주행을 중지했습니다.',
    );
    expect(situationSummary).toBeInTheDocument();
    expect(situationSummary).not.toHaveClass('truncate');
    expect(situationSummary).not.toHaveAttribute('title');

    expect(container.querySelectorAll('video')).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(2);
    const pathBlockedImage = screen.getByAltText(
      '군수 시설 보급 통로에 쏟아진 수송 케이스가 정찰 로봇의 경로를 막고 있는 모습',
    );
    expect(pathBlockedImage).toHaveAttribute(
      'src',
      '/assets/interventions/military-logistics-route-blocked.png',
    );
    expect(pathBlockedImage).toHaveClass('h-auto', 'object-contain');
    expect(screen.getByAltText(
      '군 차량 정비 구역에서 안전조끼를 입은 인원이 정찰 로봇 순찰로로 진입한 모습',
    )).toHaveAttribute(
      'src',
      '/assets/interventions/military-maintenance-lane-person.png',
    );
    expect(screen.getByText('120초 전')).toBeInTheDocument();
    expect(screen.getByText('1,014초 전')).toBeInTheDocument();
    expect(screen.queryByText('즉시 대응 · 응답 대기')).not.toBeInTheDocument();
    expect(screen.queryByText('우선 확인 · 처리 중')).not.toBeInTheDocument();
    expect(screen.queryByText('우선 확인 · 응답 대기')).not.toBeInTheDocument();
    expect(screen.queryByText('2건 응답 대기 · 1건 처리 중'))
      .not.toBeInTheDocument();
    expect(screen.queryByText(
      '사람·충돌 위험은 즉시 대응, 안전 정지 후 판단이 필요한 요청은 우선 확인으로 분류됩니다.',
    )).not.toBeInTheDocument();
    expect(screen.queryByText(/P0|P1/u)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /요청을 수락하고 관제 시작/u }))
      .toHaveLength(1);
    expect(screen.getByRole('link', { name: '정찰 로봇 01 처리 중인 관제 열기' }))
      .toHaveTextContent('처리 중인 관제 열기');

    expect(screen.queryByText('robot-001')).not.toBeInTheDocument();
    expect(screen.queryByText('개입 요청 사유')).not.toBeInTheDocument();
    expect(screen.queryByText('요청 수신 시점')).not.toBeInTheDocument();
    expect(screen.queryByText('제어권')).not.toBeInTheDocument();
    expect(screen.queryByText('처리 상태')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '원격제어 시작' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '해결' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이관' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '긴급정지' })).not.toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    expect(screen.queryByText('전방 카메라')).not.toBeInTheDocument();
  });

  it('siteId가 있어도 전체 활성 요청을 유지하고 각 카드의 사이트를 표시한다', async () => {
    renderPage(
      { nowMs: () => nowMs },
      '/control/interventions?siteId=pangyo-army-ax-hub',
    );

    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('판교 육군 AX 거점 · 군수동 1층 보급 통로'))
      .toBeInTheDocument();
    expect(screen.getByText('판교 기동 시험장 · 차량 정비 구역 순찰로'))
      .toBeInTheDocument();
  });

  it('요청 경과 시간을 천 단위 구분이 있는 초 단위로 갱신한다', async () => {
    vi.useFakeTimers();
    let currentNowMs = nowMs;
    renderPage({ nowMs: () => currentNowMs });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('1,014초 전')).toBeInTheDocument();

    await act(async () => {
      currentNowMs += 2_000;
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByText('1,016초 전')).toBeInTheDocument();
  });

  it('처리 중 요청은 상태를 바꾸지 않고 interventionId가 포함된 관제로 재진입한다', async () => {
    renderPage();

    expect(await screen.findByRole('link', {
      name: '정찰 로봇 01 처리 중인 관제 열기',
    })).toHaveAttribute(
      'href',
      '/control/monitoring/robot-001?siteId=pangyo-army-ax-hub&interventionId=intervention-001',
    );
  });

  it('대기 요청을 수락한 뒤 공유 상태를 갱신하고 해당 관제로 이동한다', async () => {
    const user = userEvent.setup();
    const { queue } = renderPage();

    await user.click(await screen.findByRole('button', {
      name: '정찰 로봇 03 요청을 수락하고 관제 시작',
    }));

    await waitFor(async () => {
      await expect(queue.getRequest('intervention-002')).resolves.toMatchObject({
        status: 'accepted',
      });
    });
    expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent(
      '/control/monitoring/robot-003?siteId=pangyo-outdoor-zone&interventionId=intervention-002',
    );
  });
});