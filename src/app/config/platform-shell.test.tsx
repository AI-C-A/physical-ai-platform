import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BrandingContext, type BrandingConfig } from '@/shared/config';
import { PlatformShell } from '@/widgets/platform-shell';

import { MINI_APP_REGISTRY } from './mini-app-registry';

const branding: BrandingConfig = {
  productName: 'ROBOT Army TIGER+',
  shortName: 'ROBOT Army TIGER+',
  logo: '/assets/army-tiger-logo.png',
};

function renderShell(initialPath = '/control/monitoring') {
  return render(
    <BrandingContext.Provider value={branding}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<PlatformShell miniApps={MINI_APP_REGISTRY} />} path="/">
            <Route element={<p>관제 모니터링 화면</p>} path="control/monitoring" />
            <Route element={<p>로봇 영상 관제</p>} path="control/monitoring/:robotId" />
            <Route element={<p>로봇 관리 화면</p>} path="control/robots" />
          </Route>
        </Routes>
      </MemoryRouter>
    </BrandingContext.Provider>,
  );
}

describe('PlatformShell', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
    document.title = '';
  });

  it('본문 건너뛰기와 현재 화면 제목을 제공한다', async () => {
    const user = userEvent.setup();
    renderShell();

    const main = screen.getByRole('main');
    const skipLink = screen.getByRole('link', { name: '본문으로 건너뛰기' });
    expect(main).toHaveAttribute('id', 'main-content');
    expect(document.title).toBe('모니터링 | ROBOT Army TIGER+');
    await user.tab();
    expect(skipLink).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(main).toHaveFocus();
  });

  it('업무 메뉴로 이동하면 본문 포커스와 제목을 갱신한다', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('link', { name: '로봇 관리' }));
    expect(screen.getByText('로봇 관리 화면')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(document.title).toBe('로봇 관리 | ROBOT Army TIGER+');
  });

  it('Robot 영상 관제에서는 글로벌 메뉴를 숨긴다', () => {
    renderShell('/control/monitoring/robot-001');
    expect(screen.getByText('로봇 영상 관제')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사이드바 접기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '모니터링' })).not.toBeInTheDocument();
  });
});
