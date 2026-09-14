import { BrandingContext } from '@/shared/config';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RobotCatalogContext,
  RobotOperationalStatusContext,
  type RobotCatalogPort,
  type RobotDescriptor,
  type RobotOperationalStatusQueryPort,
} from '@/entities/robot';
import {
  RobotVideoContext,
  type RobotVideoPort,
} from '@/entities/robot-video';

import { MultiRobotMonitoringPage } from './MultiRobotMonitoringPage';

const robots = Array.from({ length: 8 }, (_, index): RobotDescriptor => {
  const robotNumber = index + 1;
  const label = String(robotNumber).padStart(2, '0');
  return {
    id: `robot-${String(robotNumber).padStart(3, '0')}`,
    displayName: `로봇 ${label}`,
    integrationProfileId: 'patrol-rest-v1',
    name: `로봇 ${label}`,
    serialNumber: `MOCK${label}`,
  };
});

const operationalStatus: RobotOperationalStatusQueryPort = {
  getOperationalStatus: () => Promise.resolve(null),
  listOperationalDataSources: () => Promise.resolve([]),
};

const emptyVideo: RobotVideoPort = {
  listSources: () => Promise.resolve([]),
  openSource: () => Promise.reject(new Error('테스트에서 영상을 열지 않습니다.')),
};

const catalog: RobotCatalogPort = {
  getRobot: (robotId) => Promise.resolve(
    robots.find((robot) => robot.id === robotId) ?? null,
  ),
  listRobots: () => Promise.resolve(robots),
  queryRobots: () => Promise.resolve({
    items: robots,
    page: 1,
    pageSize: robots.length,
    totalItems: robots.length,
    totalPages: 1,
  }),
};

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="current-location" hidden>
      {`${location.pathname}${location.search}`}
    </output>
  );
}

function renderPage(initialEntry: string) {
  return render(
    <RobotCatalogContext.Provider value={catalog}>
      <RobotOperationalStatusContext.Provider value={operationalStatus}>
        <RobotVideoContext.Provider value={emptyVideo}>
          <BrandingContext.Provider value={{ productName: 'ROBOT Army TIGER+', shortName: 'ROBOT Army TIGER+', logo: '/assets/army-tiger-logo.png' }}><MemoryRouter initialEntries={[initialEntry]}>
            <MultiRobotMonitoringPage />
            <CurrentLocation />
          </MemoryRouter></BrandingContext.Provider>
        </RobotVideoContext.Provider>
      </RobotOperationalStatusContext.Provider>
    </RobotCatalogContext.Provider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('MultiRobotMonitoringPage', () => {
  it('URL의 중복·초과·존재하지 않는 로봇을 정리하고 선택 순서대로 패널을 표시한다', async () => {
    renderPage(
      '/control/monitoring/multi?siteId=alpha'
      + '&robotId=robot-002&robotId=robot-002&robotId=missing'
      + '&robotId=robot-001&robotId=robot-003&robotId=robot-004'
      + '&robotId=robot-005&robotId=robot-006&robotId=robot-007',
    );

    expect(await screen.findByRole('heading', {
      level: 1,
      name: '다중 관제',
    })).toBeInTheDocument();
    expect(await screen.findByLabelText('로봇 02 카메라 패널'))
      .toBeInTheDocument();
    expect(screen.getByLabelText('로봇 01 카메라 패널')).toBeInTheDocument();
    expect(screen.queryByLabelText('로봇 06 카메라 패널')).not.toBeInTheDocument();
    expect(await screen.findByRole('status', {
      name: '선택 정리 안내',
    })).toHaveTextContent(/찾을 수 없는 로봇 missing/u);
    await waitFor(() => {
      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/control/monitoring/multi?siteId=alpha&mode=multi&robotId=robot-002&robotId=robot-001&robotId=robot-003&robotId=robot-004&robotId=robot-005',
      );
    });
  });

  it('구성 변경에서 2대 최소를 지키며 로봇을 즉시 추가·제거한다', async () => {
    const user = userEvent.setup();
    renderPage(
      '/control/monitoring/multi?siteId=alpha&mode=multi'
      + '&robotId=robot-001&robotId=robot-002',
    );

    expect(await screen.findByLabelText('로봇 01 카메라 패널'))
      .toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '구성 변경' }));
    const firstRobot = screen.getByRole('checkbox', { name: /로봇 01/u });
    expect(firstRobot).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /로봇 03/u }));
    expect(firstRobot).toBeEnabled();
    expect(await screen.findByLabelText('로봇 03 카메라 패널'))
      .toBeInTheDocument();

    await user.click(firstRobot);
    await waitFor(() => {
      expect(screen.queryByLabelText('로봇 01 카메라 패널'))
        .not.toBeInTheDocument();
    });
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/monitoring/multi?siteId=alpha&mode=multi&robotId=robot-002&robotId=robot-003',
    );
    await user.click(screen.getByRole('button', { name: '메뉴 닫기' }));
    expect(screen.getByRole('link', { name: '다중 영상 관제 나가기' }))
      .toHaveAttribute(
        'href',
        '/control/monitoring?siteId=alpha&mode=multi&robotId=robot-002&robotId=robot-003',
      );
  });

  it('유효한 선택이 2대 미만이면 카메라 연결 대신 구성 안내를 표시한다', async () => {
    renderPage(
      '/control/monitoring/multi?mode=multi&robotId=robot-001',
    );

    expect(await screen.findByText(
      '다중 관제를 시작하려면 로봇을 2대 이상 선택해 주세요.',
    )).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '다중 로봇 카메라' }))
      .not.toBeInTheDocument();
  });
});
