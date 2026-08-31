import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInMemoryInterventionRequests,
  InMemoryInterventionQueue,
  InterventionQueueContext,
} from '@/entities/intervention';
import {
  RobotCatalogContext,
  type RobotCatalogPort,
  type RobotDescriptor,
} from '@/entities/robot';
import {
  RobotVideoContext,
  type RobotVideoPort,
  type RobotVideoSession,
} from '@/entities/robot-video';
import type { ClockPort } from '@/shared/lib/clock';
import { ToastProvider } from '@/shared/ui/toast';

import { RobotMonitoringPage } from './RobotMonitoringPage';

const nowMs = Date.parse('2026-08-30T01:00:00Z');
const clock: ClockPort = { nowMs: () => nowMs };

const robot: RobotDescriptor = {
  id: 'robot-001',
  serialNumber: 'MOCK00001',
  name: '정찰 로봇 01',
  displayName: '정찰 로봇 01',
  integrationProfileId: 'patrol-rest-v1',
};

const robot3: RobotDescriptor = {
  ...robot,
  id: 'robot-003',
  serialNumber: 'MOCK00003',
  name: '정찰 로봇 03',
  displayName: '정찰 로봇 03',
};

function createCatalog(descriptor: RobotDescriptor): RobotCatalogPort {
  return {
    listRobots: () => Promise.resolve([descriptor]),
    queryRobots: () => Promise.resolve({
      items: [descriptor],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    }),
    getRobot: (robotId) => Promise.resolve(
      robotId === descriptor.id ? descriptor : null,
    ),
  };
}

const catalog = createCatalog(robot);
const emptyVideo: RobotVideoPort = {
  listSources: () => Promise.resolve([]),
  openSource: () => Promise.reject(new Error('연결할 Camera source가 없습니다.')),
};

function createQueue() {
  return new InMemoryInterventionQueue(createInMemoryInterventionRequests(clock));
}

function renderRobotMonitoring(
  catalogPort: RobotCatalogPort = catalog,
  videoPort: RobotVideoPort = emptyVideo,
  initialEntry = '/control/monitoring/robot-001',
  queue = createQueue(),
) {
  const view = render(
    <RobotCatalogContext.Provider value={catalogPort}>
      <RobotVideoContext.Provider value={videoPort}>
        <InterventionQueueContext.Provider value={queue}>
          <ToastProvider>
            <MemoryRouter initialEntries={[initialEntry]}>
              <Routes>
                <Route
                  element={<RobotMonitoringPage />}
                  path="/control/monitoring/:robotId"
                />
                <Route
                  element={<p>개입 요청 목록으로 복귀</p>}
                  path="/control/interventions"
                />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </InterventionQueueContext.Provider>
      </RobotVideoContext.Provider>
    </RobotCatalogContext.Provider>,
  );
  return { ...view, queue };
}

afterEach(() => vi.restoreAllMocks());

describe('RobotMonitoringPage', () => {
  it('일반 관제 URL은 개입 조작 없이 기존 카메라와 나가기 동작을 유지한다', async () => {
    renderRobotMonitoring(
      catalog,
      emptyVideo,
      '/control/monitoring/robot-001?siteId=pangyo-army-ax-hub',
    );

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: robot.displayName,
    });
    expect(heading).toHaveClass('text-foreground');
    expect(heading.closest('.h-dvh')).toHaveAttribute('data-color-scheme', 'dark');
    expect(heading.closest('.h-dvh')).toHaveAttribute('data-color-layer', 'raised');
    expect(screen.queryByText(robot.id)).not.toBeInTheDocument();
    expect(screen.queryByText(robot.serialNumber ?? '')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '개입 대응' })).not.toBeInTheDocument();
    const exitLink = screen.getByRole('link', { name: '영상 관제 나가기' });
    expect(exitLink).toHaveTextContent('나가기');
    expect(exitLink).toHaveClass(
      'bg-transparent',
      'text-negative',
      'hover:bg-status-negative-background',
      'active:bg-status-negative-background',
    );
    expect(exitLink).toHaveAttribute(
      'href',
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    );
    expect(await screen.findByText('사용 가능한 카메라 소스가 없습니다.'))
      .toBeInTheDocument();
  });

  it('전체 목록 대신 관제할 Robot 하나만 조회한다', async () => {
    const listRobots = vi.fn<RobotCatalogPort['listRobots']>();
    const queryRobots = vi.fn<RobotCatalogPort['queryRobots']>();
    const getRobot = vi.fn<RobotCatalogPort['getRobot']>(() => Promise.resolve(robot));

    renderRobotMonitoring({ listRobots, queryRobots, getRobot });

    expect(await screen.findByRole('heading', { level: 1, name: robot.displayName }))
      .toBeInTheDocument();
    expect(getRobot).toHaveBeenCalledOnce();
    expect(getRobot).toHaveBeenCalledWith(robot.id);
    expect(listRobots).not.toHaveBeenCalled();
    expect(queryRobots).not.toHaveBeenCalled();
  });

  it('모든 카메라 source를 연결하고 화면 이탈 시 각 session을 정리한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const closeFront = vi.fn();
    const closeRear = vi.fn();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const createSession = (close: () => void): RobotVideoSession => ({
      mediaStream: stream,
      subscribeStatus: (listener) => {
        listener('connected');
        return () => undefined;
      },
      close,
    });
    const openSource = vi.fn((sourceId: string) => Promise.resolve(
      createSession(sourceId === 'camera-front' ? closeFront : closeRear),
    ));
    const video: RobotVideoPort = {
      listSources: () => Promise.resolve([
        { id: 'camera-front', robotId: robot.id, displayName: '전방 Camera' },
        { id: 'camera-rear', robotId: robot.id, displayName: '후방 Camera' },
      ]),
      openSource,
    };

    const view = renderRobotMonitoring(catalog, video);

    await waitFor(() => expect(openSource).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('전방 Camera 영상')).toBeInTheDocument();
    expect(screen.getByLabelText('후방 Camera 영상')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '카메라 영상' })).toHaveAttribute(
      'data-presentation',
      'monitoring',
    );
    expect(screen.queryByRole('button', { name: /크게 보기/u }))
      .not.toBeInTheDocument();

    view.unmount();
    expect(closeFront).toHaveBeenCalledOnce();
    expect(closeRear).toHaveBeenCalledOnce();
  });

  it('accepted 요청에는 관제 후속 조치만 표시하고 나가기는 개입 목록으로 연결한다', async () => {
    renderRobotMonitoring(
      catalog,
      emptyVideo,
      '/control/monitoring/robot-001?siteId=pangyo-army-ax-hub&interventionId=intervention-001',
    );

    const actionBar = await screen.findByRole('region', { name: '개입 대응' });
    expect(within(actionBar).getByText('우회 경로 확인'))
      .toBeInTheDocument();
    expect(within(actionBar).getByText('현재 상태 · 수락됨')).toBeInTheDocument();
    expect(within(actionBar).getByRole('button', { name: '원격제어 시작' }))
      .toBeInTheDocument();
    expect(within(actionBar).getByRole('button', { name: '해결' })).toBeInTheDocument();
    expect(within(actionBar).getByRole('button', { name: '이관' })).toBeInTheDocument();
    expect(within(actionBar).getByRole('button', { name: '긴급정지' }))
      .toBeInTheDocument();
    expect(within(actionBar).queryByRole('button', { name: '수락' }))
      .not.toBeInTheDocument();
    expect(screen.getAllByText(robot.displayName)).toHaveLength(1);
    expect(screen.getByRole('link', { name: '영상 관제 나가기' })).toHaveAttribute(
      'href',
      '/control/interventions?siteId=pangyo-army-ax-hub',
    );
  });

  it('waiting 요청에는 수락만 제공한다', async () => {
    renderRobotMonitoring(
      createCatalog(robot3),
      emptyVideo,
      '/control/monitoring/robot-003?siteId=pangyo-outdoor-zone&interventionId=intervention-002',
    );

    const actionBar = await screen.findByRole('region', { name: '개입 대응' });
    expect(within(actionBar).getByRole('button', { name: '수락' })).toBeInTheDocument();
    expect(within(actionBar).queryByRole('button', { name: '원격제어 시작' }))
      .not.toBeInTheDocument();
    expect(within(actionBar).queryByRole('button', { name: '해결' }))
      .not.toBeInTheDocument();
    expect(within(actionBar).queryByRole('button', { name: '이관' }))
      .not.toBeInTheDocument();
    expect(within(actionBar).queryByRole('button', { name: '긴급정지' }))
      .not.toBeInTheDocument();
  });

  it('긴급정지는 확인 전 상태를 유지하고 확인 후에만 실행한다', async () => {
    const user = userEvent.setup();
    const { queue } = renderRobotMonitoring(
      catalog,
      emptyVideo,
      '/control/monitoring/robot-001?interventionId=intervention-001',
    );

    await user.click(await screen.findByRole('button', { name: '긴급정지' }));
    expect(await screen.findByRole('dialog', { name: '긴급정지를 실행하시겠습니까?' }))
      .toBeInTheDocument();
    await expect(queue.getRequest('intervention-001')).resolves.toMatchObject({
      status: 'accepted',
    });
    expect(screen.getByText(robot.displayName, { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('판교 육군 AX 거점 · 군수동 1층 보급 통로'))
      .toBeInTheDocument();
    expect(screen.getByText(/모든 동작을 중단/u)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '긴급정지 실행' }));

    await waitFor(async () => {
      await expect(queue.getRequest('intervention-001')).resolves.toMatchObject({
        status: 'emergency-stop',
      });
    });
    const actionBar = await screen.findByRole('region', { name: '개입 대응' });
    expect(within(actionBar).getByText('현재 상태 · 긴급정지')).toBeInTheDocument();
    expect(within(actionBar).queryByRole('button', { name: '긴급정지' }))
      .not.toBeInTheDocument();
    expect(within(actionBar).queryByRole('button', { name: '원격제어 시작' }))
      .not.toBeInTheDocument();
    expect(within(actionBar).getByRole('button', { name: '해결' })).toBeInTheDocument();
    expect(within(actionBar).getByRole('button', { name: '이관' })).toBeInTheDocument();
  });

  it('해결 성공 시 토스트를 표시하고 개입 목록으로 복귀하며 활성 목록에서 제거한다', async () => {
    const user = userEvent.setup();
    const { queue } = renderRobotMonitoring(
      catalog,
      emptyVideo,
      '/control/monitoring/robot-001?siteId=pangyo-army-ax-hub&interventionId=intervention-001',
    );

    await user.click(await screen.findByRole('button', { name: '해결' }));

    expect(await screen.findByText('개입 요청 목록으로 복귀')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('개입 요청을 해결했습니다.');
    expect((await queue.listActiveRequests()).map(({ id }) => id))
      .not.toContain('intervention-001');
  });

  it('명령 실패 시 오류를 알리고 관제 화면과 기존 상태를 유지한다', async () => {
    const user = userEvent.setup();
    const queue = createQueue();
    vi.spyOn(queue, 'resolve').mockRejectedValue(new Error('제어 명령 전송에 실패했습니다.'));
    renderRobotMonitoring(
      catalog,
      emptyVideo,
      '/control/monitoring/robot-001?interventionId=intervention-001',
      queue,
    );

    await user.click(await screen.findByRole('button', { name: '해결' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('개입 명령을 실행하지 못했습니다. 다시 시도해 주세요.');
    expect(alert).not.toHaveTextContent('제어 명령 전송에 실패했습니다.');
    expect(screen.getByRole('region', { name: '개입 대응' })).toBeInTheDocument();
    await expect(queue.getRequest('intervention-001')).resolves.toMatchObject({
      status: 'accepted',
    });
  });

  it('없거나 현재 로봇과 불일치한 interventionId는 카메라를 유지하고 조작을 차단한다', async () => {
    const first = renderRobotMonitoring(
      catalog,
      emptyVideo,
      '/control/monitoring/robot-001?interventionId=missing-intervention',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('개입 요청을 찾을 수 없어');
    expect(screen.queryByRole('region', { name: '개입 대응' })).not.toBeInTheDocument();
    expect(await screen.findByText('사용 가능한 카메라 소스가 없습니다.'))
      .toBeInTheDocument();

    first.unmount();
    renderRobotMonitoring(
      catalog,
      emptyVideo,
      '/control/monitoring/robot-001?interventionId=intervention-002',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('현재 로봇과 일치하지 않아');
    expect(screen.queryByRole('region', { name: '개입 대응' })).not.toBeInTheDocument();
  });
});
