import { lazy } from 'react';
import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BrandingContext, type BrandingConfig } from '@/shared/config';
import { PlatformShell } from '@/widgets/platform-shell';

import { MINI_APP_REGISTRY } from './mini-app-registry';

const branding: BrandingConfig = {
  productName: 'ROBOT Army TIGER+',
  shortName: 'ROBOT Army TIGER+',
  logo: '/assets/army-tiger-logo.png',
};

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="current-location" hidden>
      {`${location.pathname}${location.search}`}
    </output>
  );
}

function renderShell(initialPath = '/control/monitoring') {
  return render(
    <BrandingContext.Provider value={branding}>
      <MemoryRouter initialEntries={[initialPath]}>
        <CurrentLocation />
        <Routes>
          <Route
            element={<PlatformShell miniApps={MINI_APP_REGISTRY} />}
            path="/"
          >
            <Route
              element={<p>관제 모니터링 화면</p>}
              path="control/monitoring"
            />
            <Route
              element={<p>로봇 영상 관제</p>}
              path="control/monitoring/:robotId"
            />
            <Route
              element={<p>로봇 관리 화면</p>}
              path="control/robots"
            />
            <Route
              element={<p>MLOps 데이터 수집 화면</p>}
              path="mlops/capture"
            />
            <Route
              element={<p>BigData 개요 화면</p>}
              path="bigdata/overview"
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </BrandingContext.Provider>,
  );
}

const SuspendedPage = lazy(
  () => new Promise<{ readonly default: () => null }>(() => undefined),
);

describe('PlatformShell', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    document.title = '';
  });

  it('초기 포커스를 유지하고 본문 건너뛰기를 제공한다', async () => {
    const user = userEvent.setup();
    renderShell();

    const main = screen.getByRole('main');
    const skipLink = screen.getByRole('link', {
      name: '본문으로 건너뛰기',
    });
    expect(main).not.toHaveFocus();
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(document.title).toBe('모니터링 | ROBOT Army TIGER+');

    await user.tab();
    expect(skipLink).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(main).toHaveFocus();
  });

  it('클라이언트 경로 전환 후 본문으로 포커스를 옮기고 제목을 갱신한다', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('link', { name: '로봇 관리' }));

    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveFocus();
    });
    expect(document.title).toBe('로봇 관리 | ROBOT Army TIGER+');
  });

  it('본문이 지연 로딩되어도 Shell과 업무 메뉴를 유지한다', () => {
    render(
      <BrandingContext.Provider value={branding}>
        <MemoryRouter initialEntries={['/control/monitoring']}>
          <Routes>
            <Route
              element={<PlatformShell miniApps={MINI_APP_REGISTRY} />}
              path="/"
            >
              <Route element={<SuspendedPage />} path="control/monitoring" />
            </Route>
          </Routes>
        </MemoryRouter>
      </BrandingContext.Provider>,
    );

    expect(screen.getByRole('link', { name: '모니터링' })).toBeInTheDocument();
    const loadingStatus = screen.getByRole('status', { name: '불러오는 중' });
    expect(screen.getByRole('main')).toContainElement(
      loadingStatus,
    );
  });

  it('Robot 영상 관제에서는 글로벌 메뉴를 숨긴다', () => {
    renderShell('/control/monitoring/robot-001');

    expect(screen.getByText('로봇 영상 관제')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사이드바 접기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '업무 메뉴 열기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '모니터링' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('p-0');
  });

  it('업무 메뉴와 Dropdown으로 미니앱을 이동한다', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('link', { name: '로봇 관리' }));
    expect(screen.getByText('로봇 관리 화면')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveFocus();
    });

    screen
      .getByRole('button', { name: '미니앱 전환 · 관제' })
      .focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: '관제' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('menuitem', { name: 'MLOps' }),
    ).not.toHaveAttribute('aria-current');
    await user.click(screen.getByRole('menuitem', { name: 'MLOps' }));
    expect(screen.getByText('MLOps 데이터 수집 화면')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: '미니앱 전환 · MLOps' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'BigData' }));
    expect(screen.getByText('BigData 개요 화면')).toBeInTheDocument();
  });

  it('사이드바 메뉴와 미니앱을 이동해도 선택한 사이트 ID를 유지한다', async () => {
    const user = userEvent.setup();
    renderShell('/control/monitoring?search=robot&siteId=pangyo-army-ax-hub');

    expect(screen.getByRole('link', { name: '로봇 관리' })).toHaveAttribute(
      'href',
      '/control/robots?siteId=pangyo-army-ax-hub',
    );
    await user.click(screen.getByRole('link', { name: '로봇 관리' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/robots?siteId=pangyo-army-ax-hub',
    );

    expect(screen.getByRole('link', { name: '모니터링' })).toHaveAttribute(
      'href',
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    );
    await user.click(screen.getByRole('link', { name: '모니터링' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    );

    await user.click(screen.getByRole('button', { name: '미니앱 전환 · 관제' }));
    await user.click(screen.getByRole('menuitem', { name: 'MLOps' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/mlops/capture?siteId=pangyo-army-ax-hub',
    );

    await user.click(screen.getByRole('button', { name: '미니앱 전환 · MLOps' }));
    await user.click(screen.getByRole('menuitem', { name: '관제' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    );
  });

  it('접힘 상태를 브라우저에 저장하고 메뉴의 접근 가능한 이름을 유지한다', async () => {
    const user = userEvent.setup();
    const view = renderShell();

    const collapseButton = screen.getByRole('button', {
      name: '사이드바 접기',
    });
    const sidebarControlRegion = collapseButton.parentElement;
    const appSwitcherRegion = screen.getByRole('button', {
      name: '미니앱 전환 · 관제',
    }).parentElement;
    await user.click(collapseButton);
    expect(
      window.localStorage.getItem(
        'army-robot.platform-shell.collapsed.v1',
      ),
    ).toBe('true');
    expect(
      screen.getByRole('link', { name: '모니터링' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '미니앱 전환 · 관제' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '미니앱 전환 · 관제' })
        .parentElement,
    ).toBe(appSwitcherRegion);
    expect(
      screen.getByRole('button', { name: '사이드바 펼치기' })
        .parentElement,
    ).toBe(sidebarControlRegion);
    expect(screen.getByRole('link', { name: '모니터링' })).toHaveClass(
      'bg-neutral-900',
    );
    expect(
      screen.getByRole('link', { name: '개입 요청' }),
    ).not.toHaveClass('bg-neutral-900');

    view.unmount();
    renderShell();
    expect(
      screen.getByRole('button', { name: '사이드바 펼치기' }),
    ).toBeInTheDocument();

    await user.hover(screen.getByRole('link', { name: '모니터링' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('모니터링');
  });

  it('Sheet를 Escape로 닫으면 메뉴 버튼으로 포커스를 복귀한다', async () => {
    const user = userEvent.setup();
    renderShell('/mlops/capture');

    const menuTrigger = screen.getByRole('button', {
      name: '업무 메뉴 열기',
    });
    await user.click(menuTrigger);
    expect(
      screen.getByRole('dialog', { name: 'ROBOT Army TIGER+ 메뉴' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'ROBOT Army TIGER+ 메뉴' }),
    ).not.toBeInTheDocument();
    expect(menuTrigger).toHaveFocus();
  });

  it('유효하지 않은 저장값은 펼침 상태로 복구한다', () => {
    window.localStorage.setItem(
      'army-robot.platform-shell.collapsed.v1',
      'invalid',
    );
    renderShell();
    expect(
      screen.getByRole('button', { name: '사이드바 접기' }),
    ).toBeInTheDocument();
  });
});
