import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  RobotCatalogContext,
  type RobotCatalogPort,
  type RobotDescriptor,
} from '@/entities/robot';

import { RobotMonitoringPage } from './RobotMonitoringPage';

const robot: RobotDescriptor = {
  id: 'robot-001',
  serialNumber: 'MOCK00001',
  displayName: '정찰 로봇 01',
  description: null,
  integrationProfileId: 'quadruped-standard-v1',
};

function renderPage(catalog: RobotCatalogPort) {
  return render(
    <RobotCatalogContext.Provider value={catalog}>
      <MemoryRouter initialEntries={['/control/monitoring/robot-001']}>
        <Routes>
          <Route element={<RobotMonitoringPage />} path="/control/monitoring/:robotId" />
        </Routes>
      </MemoryRouter>
    </RobotCatalogContext.Provider>,
  );
}

describe('RobotMonitoringPage', () => {
  it('선택 Robot 하나를 조회해 영상 관제 준비 화면을 표시한다', async () => {
    const getRobot = vi.fn(() => Promise.resolve(robot));
    const listRobots = vi.fn<RobotCatalogPort['listRobots']>();
    const queryRobots = vi.fn<RobotCatalogPort['queryRobots']>();
    const catalog: RobotCatalogPort = {
      listRobots,
      queryRobots,
      getRobot,
    };
    renderPage(catalog);

    expect(await screen.findByRole('heading', { name: robot.displayName })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('영상 관제 기능을 준비하고 있습니다.');
    expect(getRobot).toHaveBeenCalledWith(robot.id);
    expect(listRobots).not.toHaveBeenCalled();
    expect(queryRobots).not.toHaveBeenCalled();
  });
});
