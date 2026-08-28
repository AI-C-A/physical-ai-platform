import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { RobotMonitoringPage } from './RobotMonitoringPage';

const robot: RobotDescriptor = {
  id: 'robot-001',
  serialNumber: 'MOCK00001',
  name: '정찰 로봇 01',
  displayName: '정찰 로봇 01',
  integrationProfileId: 'patrol-rest-v1',
};

const catalog: RobotCatalogPort = {
  listRobots: () => Promise.resolve([robot]),
  queryRobots: () => Promise.resolve({
    items: [robot],
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  }),
  getRobot: () => Promise.resolve(robot),
};

const emptyVideo: RobotVideoPort = {
  listSources: () => Promise.resolve([]),
  openSource: () => Promise.reject(new Error('연결할 Camera source가 없습니다.')),
};

function renderRobotMonitoring(
  catalogPort: RobotCatalogPort = catalog,
  videoPort: RobotVideoPort = emptyVideo,
  initialEntry = '/control/monitoring/robot-001',
) {
  return render(
    <RobotCatalogContext.Provider value={catalogPort}>
      <RobotVideoContext.Provider value={videoPort}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              element={<RobotMonitoringPage />}
              path="/control/monitoring/:robotId"
            />
          </Routes>
        </MemoryRouter>
      </RobotVideoContext.Provider>
    </RobotCatalogContext.Provider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('RobotMonitoringPage', () => {
  it('중복 상세 정보 없이 선택 Robot의 카메라 관제 화면을 표시한다', async () => {
    renderRobotMonitoring(
      catalog,
      emptyVideo,
      '/control/monitoring/robot-001?siteId=pangyo-army-ax-hub',
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: robot.displayName }),
    ).toBeInTheDocument();
    expect(screen.queryByText('전체 화면 관제')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '모니터링으로 돌아가기' })).toHaveAttribute(
      'href',
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    );
    expect(screen.queryByRole('heading', { name: '로봇 정보' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '운영 상태' })).not.toBeInTheDocument();
    expect(
      await screen.findByText('사용 가능한 카메라 소스가 없습니다.'),
    ).toBeInTheDocument();
  });

  it('전체 목록 대신 관제할 Robot 하나만 조회한다', async () => {
    const listRobots = vi.fn<RobotCatalogPort['listRobots']>();
    const queryRobots = vi.fn<RobotCatalogPort['queryRobots']>();
    const getRobot = vi.fn<RobotCatalogPort['getRobot']>(() => Promise.resolve(robot));

    renderRobotMonitoring({ listRobots, queryRobots, getRobot });

    expect(
      await screen.findByRole('heading', { level: 1, name: robot.displayName }),
    ).toBeInTheDocument();
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
    expect(
      screen.queryByRole('button', { name: /크게 보기/u }),
    ).not.toBeInTheDocument();

    view.unmount();
    expect(closeFront).toHaveBeenCalledOnce();
    expect(closeRear).toHaveBeenCalledOnce();
  });
});
