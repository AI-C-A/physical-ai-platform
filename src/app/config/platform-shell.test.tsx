import { lazy } from 'react';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
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
              path="mlops/collection"
            />
            <Route
              element={<p>새 수집 모달 화면</p>}
              path="mlops/collection/new"
            />
            <Route element={<p>장치 연결 모달 화면</p>} path="mlops/collection/:sessionId/setup" />
            <Route element={<p>시뮬레이션 수집 몰입형 화면</p>} path="mlops/collection/:sessionId/simulation" />
            <Route
              element={<p>수집 세션 몰입형 화면</p>}
              path="mlops/collection/:sessionId"
            />
            <Route
              element={<p>휴머노이드 몰입형 수집 화면</p>}
              path="mlops/capture/humanoid"
            />
            <Route
              element={<p>BigData 개요 화면</p>}
              path="bigdata/overview"
            />
            <Route
              element={<p>공통 설정 화면</p>}
              path="control/settings"
            />
            <Route
              element={<p>공통 설정 화면</p>}
              path="mlops/settings"
            />
            <Route
              element={<p>공통 설정 화면</p>}
              path="bigdata/settings"
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

  it.each([
    ['/mlops/collection/capture-h-0001', '수집 세션 몰입형 화면'],
    ['/mlops/collection/capture-h-0001/simulation', '시뮬레이션 수집 몰입형 화면'],
  ])('수집 콘솔에서는 글로벌 메뉴를 숨긴다', (path, content) => {
    renderShell(path);

    expect(screen.getByText(content)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사이드바 접기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '업무 메뉴 열기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '수집' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('p-0');
    expect(screen.getByRole('main')).toHaveAttribute('data-page-shell', 'full-bleed');
  });

  it.each(['/mlops/collection/new', '/mlops/collection/capture-h-0001/setup'])('설정 모달 %s에서는 목록 레이아웃을 유지한다', (path) => {
    renderShell(path);
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('data-page-shell', 'standard');
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
    expect(await screen.findByText('MLOps 데이터 수집 화면')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: '미니앱 전환 · MLOps' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'BigData' }));
    expect(await screen.findByText('BigData 개요 화면')).toBeInTheDocument();
  });

  it('앱 런처를 키보드로 탐색하고 Escape로 닫으면 런처에 포커스를 돌린다', async () => {
    const user = userEvent.setup();
    renderShell();

    const launcher = screen.getByRole('button', { name: '미니앱 전환 · 관제' });
    expect(screen.getByRole('complementary')).toContainElement(launcher);
    expect(screen.queryByRole('menuitem', { name: 'MLOps' })).not.toBeInTheDocument();
    launcher.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: '관제' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'MLOps' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'BigData' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'MLOps' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it('런처에서 현재 앱을 선택하면 작업 페이지를 유지한다', async () => {
    const user = userEvent.setup();
    renderShell('/control/robots?siteId=pangyo-army-ax-hub');

    const launcher = screen.getByRole('button', { name: '미니앱 전환 · 관제' });
    await user.click(launcher);
    await user.click(screen.getByRole('menuitem', { name: '관제' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/robots?siteId=pangyo-army-ax-hub',
    );
    expect(launcher).toHaveFocus();
  });

  it('MLOps 업무 메뉴 8개를 접힘 그룹 없이 한 목록으로 표시한다', () => {
    renderShell('/mlops/collection');

    const navigation = screen.getByRole('navigation', {
      name: '미니앱 업무 메뉴',
    });
    expect(within(navigation).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(navigation).getAllByRole('link').map((link) => link.getAttribute('aria-label')),
    ).toEqual([
      '수집',
      '데이터 카탈로그',
      '데이터 검수',
      '데이터셋',
      '학습',
      '평가',
      '모델 레지스트리',
      '운영',
    ]);
  });

  it.each([
    ['/control/monitoring', '/control/settings'],
    ['/mlops/collection', '/mlops/settings'],
    ['/bigdata/overview', '/bigdata/settings'],
  ])('%s에서 현재 미니앱의 설정 메뉴로 이동한다', async (
    initialPath,
    settingsPath,
  ) => {
    const user = userEvent.setup();
    renderShell(initialPath);

    const aside = screen.getByRole('complementary');
    const bottomRegion = aside.lastElementChild;
    expect(bottomRegion).toBeInstanceOf(HTMLElement);
    if (!(bottomRegion instanceof HTMLElement)) return;
    const settingsLink = within(bottomRegion).getByRole('link', {
      name: '설정',
    });
    expect(settingsLink).toHaveAttribute('href', settingsPath);

    await user.click(settingsLink);
    expect(screen.getByText('공통 설정 화면')).toBeInTheDocument();
    expect(settingsLink).toHaveClass('ui-navigation-item');
    expect(settingsLink).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('설정 | ROBOT Army TIGER+');
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
    await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/mlops/collection?siteId=pangyo-army-ax-hub',
    ));

    await user.click(screen.getByRole('button', { name: '미니앱 전환 · MLOps' }));
    await user.click(screen.getByRole('menuitem', { name: '관제' }));
    await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    ));
  });

  it('접힘 상태를 브라우저에 저장하고 메뉴의 접근 가능한 이름을 유지한다', async () => {
    const user = userEvent.setup();
    const view = renderShell();

    const collapseButton = screen.getByRole('button', {
      name: '사이드바 접기',
    });
    const sidebarControlRegion = collapseButton.parentElement;
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
      screen.queryByRole('button', { name: '미니앱 전환 · 관제' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '사이드바 펼치기' })
        .parentElement,
    ).toBe(sidebarControlRegion);
    expect(screen.getByRole('link', { name: '모니터링' })).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('link', { name: '개입 요청' }),
    ).not.toHaveAttribute('aria-current');

    view.unmount();
    renderShell();
    expect(
      screen.getByRole('button', { name: '사이드바 펼치기' }),
    ).toBeInTheDocument();

    await user.hover(screen.getByRole('link', { name: '모니터링' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('모니터링');

    expect(screen.queryByRole('button', { name: '미니앱 전환 · 관제' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '사이드바 펼치기' }));
    expect(screen.getByRole('button', { name: '미니앱 전환 · 관제' })).toBeInTheDocument();
  });

  it('Sheet를 Escape로 닫으면 메뉴 버튼으로 포커스를 복귀한다', async () => {
    const user = userEvent.setup();
    renderShell('/mlops/collection');

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

  it('모바일 Sheet 최하단 설정 메뉴는 현재 미니앱 경로로 이동하고 메뉴를 닫는다', async () => {
    const user = userEvent.setup();
    renderShell('/mlops/collection');

    await user.click(screen.getByRole('button', {
      name: '업무 메뉴 열기',
    }));
    const dialog = screen.getByRole('dialog', {
      name: 'ROBOT Army TIGER+ 메뉴',
    });
    const settingsLink = within(dialog).getByRole('link', {
      name: '설정',
    });
    expect(settingsLink).toHaveAttribute('href', '/mlops/settings');

    await user.click(settingsLink);

    expect(screen.queryByRole('dialog', {
      name: 'ROBOT Army TIGER+ 메뉴',
    })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/mlops/settings',
    ));
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('모바일 메뉴에서 현재 페이지를 다시 선택해도 닫힌 메뉴 대신 본문에 포커스를 둔다', async () => {
    const user = userEvent.setup();
    renderShell('/mlops/collection');

    await user.click(screen.getByRole('button', { name: '업무 메뉴 열기' }));
    const dialog = screen.getByRole('dialog', { name: 'ROBOT Army TIGER+ 메뉴' });
    await user.click(within(dialog).getByRole('link', { name: '수집' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
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
