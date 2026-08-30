import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { useBranding } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { Dropdown } from '@/shared/ui/dropdown';
import { Icon, type IconName } from '@/shared/ui/icon';
import { PageFrame, type PageFrameLayout } from '@/shared/ui/page-frame';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Sheet } from '@/shared/ui/sheet';
import { Tooltip, TooltipProvider } from '@/shared/ui/tooltip';

const sidebarCollapsedStorageKey =
  'army-robot.platform-shell.collapsed.v1';

interface MiniAppNavigationChild {
  readonly icon: IconName;
  readonly label: string;
  readonly path: string;
}

export interface MiniAppNavigationItem {
  readonly homePath: string;
  readonly icon: IconName;
  readonly id: string;
  readonly items: readonly MiniAppNavigationChild[];
  readonly label: string;
  readonly settingsPath: string;
}

interface PlatformShellProps {
  readonly miniApps: readonly MiniAppNavigationItem[];
}

function getRouteLabel(
  pathname: string,
  miniApps: readonly MiniAppNavigationItem[],
): string {
  if (pathname === '/') {
    return miniApps[0]?.items[0]?.label ?? '플랫폼';
  }

  if (miniApps.some((miniApp) => pathname === miniApp.settingsPath)) {
    return '설정';
  }

  const matchingItems = miniApps
    .flatMap((miniApp) => miniApp.items)
    .filter(
      (item) =>
        pathname === item.path || pathname.startsWith(`${item.path}/`),
    )
    .sort((left, right) => right.path.length - left.path.length);

  return matchingItems[0]?.label ?? '페이지를 찾을 수 없습니다';
}

function readSidebarCollapsed(): boolean {
  try {
    return (
      window.localStorage.getItem(sidebarCollapsedStorageKey) === 'true'
    );
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      sidebarCollapsedStorageKey,
      String(collapsed),
    );
  } catch {
    // 저장소를 사용할 수 없는 환경에서도 현재 실행 중 상태로 동작한다.
  }
}

function getSiteSelectionSearch(search: string): string {
  const siteId = new URLSearchParams(search).get('siteId');
  if (siteId === null) return '';

  return `?${new URLSearchParams({ siteId }).toString()}`;
}

function Brand({ compact }: { readonly compact: boolean }) {
  const branding = useBranding();
  const location = useLocation();
  const siteSelectionSearch = getSiteSelectionSearch(location.search);
  return (
    <Link
      aria-label={`${branding.productName} 모니터링으로 이동`}
      className={
        compact
          ? 'flex min-h-12 items-center justify-center'
          : 'flex min-h-12 min-w-0 items-center gap-3'
      }
      to={{
        pathname: '/control/monitoring',
        search: siteSelectionSearch,
      }}
    >
      {branding.logo === null ? (
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center border border-border text-xs font-black"
        >
          AR
        </span>
      ) : (
        <img
          alt=""
          className="size-9 shrink-0 object-contain"
          src={branding.logo}
        />
      )}
      {compact ? null : (
        <span className="min-w-0">
          <strong className="block truncate text-xs">
            {branding.productName}
          </strong>
        </span>
      )}
    </Link>
  );
}

function MiniAppSwitcher({
  collapsed,
  currentMiniApp,
  miniApps,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly currentMiniApp: MiniAppNavigationItem;
  readonly miniApps: readonly MiniAppNavigationItem[];
  readonly onNavigate?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const siteSelectionSearch = getSiteSelectionSearch(location.search);
  const trigger = (
    <Button
      className={
        collapsed
          ? 'mx-auto size-10 p-0'
          : 'h-10 min-h-10 w-full justify-between py-0'
      }
      {...(collapsed
        ? { title: `미니앱 전환 · ${currentMiniApp.label}` }
        : {})}
      variant="secondary"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon name="apps" />
        {collapsed ? null : (
          <span className="truncate">{currentMiniApp.label}</span>
        )}
      </span>
      {collapsed ? null : <Icon name="chevron-down" />}
    </Button>
  );

  return (
    <Dropdown
      align="start"
      items={miniApps.map((miniApp) => ({
        icon: <Icon name={miniApp.icon} />,
        label: miniApp.label,
        onSelect: () => {
          void navigate({
            pathname: miniApp.homePath,
            search: siteSelectionSearch,
          });
          onNavigate?.();
        },
        selected: miniApp.id === currentMiniApp.id,
      }))}
      label={`미니앱 전환 · ${currentMiniApp.label}`}
      matchTriggerWidth={!collapsed}
      side={collapsed ? 'right' : 'bottom'}
      trigger={trigger}
    />
  );
}

function InnerNavigation({
  collapsed,
  items,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly items: MiniAppNavigationItem['items'];
  readonly onNavigate?: () => void;
}) {
  const location = useLocation();
  const siteSelectionSearch = getSiteSelectionSearch(location.search);

  return (
    <nav
      aria-label="미니앱 업무 메뉴"
      className="grid min-w-0 gap-1"
    >
      {items.map((item) => {
        const isActive =
          location.pathname === item.path ||
          location.pathname.startsWith(`${item.path}/`);
        const link = (
          <NavLink
            aria-label={item.label}
            className={
              isActive
                ? `flex min-h-10 items-center rounded-md bg-action-secondary-active px-3 py-2 text-sm font-semibold text-foreground ${collapsed ? 'justify-center' : 'gap-3'}`
                : `flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-muted hover:bg-action-secondary-hover hover:text-foreground ${collapsed ? 'justify-center' : 'gap-3'}`
            }
            onClick={onNavigate}
            to={{
              pathname: item.path,
              search: siteSelectionSearch,
            }}
          >
            <Icon name={item.icon} />
            {collapsed ? null : <span>{item.label}</span>}
          </NavLink>
        );
        return collapsed ? (
          <Tooltip content={item.label} key={item.path} trigger={link} />
        ) : (
          <div key={item.path}>{link}</div>
        );
      })}
    </nav>
  );
}

function SettingsNavigation({
  collapsed,
  onNavigate,
  path,
}: {
  readonly collapsed: boolean;
  readonly onNavigate?: () => void;
  readonly path: string;
}) {
  const location = useLocation();
  const siteSelectionSearch = getSiteSelectionSearch(location.search);
  const isActive = location.pathname === path;
  const link = (
    <NavLink
      aria-label="설정"
      className={
        isActive
          ? `flex min-h-10 items-center rounded-md bg-action-secondary-active px-3 py-2 text-sm font-semibold text-foreground ${collapsed ? 'justify-center' : 'gap-3'}`
          : `flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-muted hover:bg-action-secondary-hover hover:text-foreground ${collapsed ? 'justify-center' : 'gap-3'}`
      }
      onClick={onNavigate}
      to={{
        pathname: path,
        search: siteSelectionSearch,
      }}
    >
      <Icon name="settings" />
      {collapsed ? null : <span>설정</span>}
    </NavLink>
  );

  return collapsed ? (
    <Tooltip content="설정" trigger={link} />
  ) : link;
}

export function PlatformShell({ miniApps }: PlatformShellProps) {
  const branding = useBranding();
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);
  const previousPathnameRef = useRef<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    readSidebarCollapsed,
  );
  const currentMiniApp = useMemo(
    () =>
      miniApps.find((item) =>
        location.pathname.startsWith(`/${item.id}`),
      ) ?? miniApps[0],
    [location.pathname, miniApps],
  );
  const routeLabel = useMemo(
    () => getRouteLabel(location.pathname, miniApps),
    [location.pathname, miniApps],
  );
  const isMonitoringRoute =
    location.pathname === '/control/monitoring'
    || location.pathname.startsWith('/control/monitoring/');
  const isImmersiveMonitoringRoute =
    /^\/control\/monitoring\/[^/]+$/u.test(location.pathname);
  const pageFrameLayout: PageFrameLayout = isImmersiveMonitoringRoute
    ? 'immersive'
    : isMonitoringRoute
      ? 'full-bleed'
      : location.pathname.endsWith('/settings')
        || location.pathname === '/mlops/capture'
        || location.pathname === '/mlops/datasets/new'
        ? 'focused'
        : location.pathname.startsWith('/bigdata/')
          ? 'wide'
          : 'standard';

  useEffect(
    () => writeSidebarCollapsed(sidebarCollapsed),
    [sidebarCollapsed],
  );

  useEffect(() => {
    document.title = `${routeLabel} | ${branding.productName}`;
  }, [branding.productName, routeLabel]);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = location.pathname;

    if (
      previousPathname === null ||
      previousPathname === '/' ||
      previousPathname === location.pathname
    ) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      mainContentRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [location.pathname]);

  if (currentMiniApp === undefined) return <Outlet />;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-layer-floating focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:ring-2 focus:ring-focus"
          href="#main-content"
          onClick={() => mainContentRef.current?.focus()}
        >
          본문으로 건너뛰기
        </a>
        {isImmersiveMonitoringRoute ? null : (
          <header className="sticky top-0 z-30 border-b border-border bg-layer-base lg:hidden">
            <div className="flex min-h-14 items-center justify-between gap-3 px-4">
              <Brand compact={false} />
              <Sheet
                onOpenChange={setMobileMenuOpen}
                open={mobileMenuOpen}
                title={`${branding.productName} 메뉴`}
                trigger={
                  <Button aria-label="업무 메뉴 열기" variant="ghost">
                    <Icon name="menu" size="md" />
                  </Button>
                }
              >
                <div className="flex h-full min-h-0 flex-col gap-5">
                  <MiniAppSwitcher
                    collapsed={false}
                    currentMiniApp={currentMiniApp}
                    miniApps={miniApps}
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <InnerNavigation
                      collapsed={false}
                      items={currentMiniApp.items}
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  </div>
                  <div className="border-t border-border pt-3">
                    <SettingsNavigation
                      collapsed={false}
                      onNavigate={() => setMobileMenuOpen(false)}
                      path={currentMiniApp.settingsPath}
                    />
                  </div>
                </div>
              </Sheet>
            </div>
          </header>
        )}

        {isImmersiveMonitoringRoute ? null : (
          <aside
            className={`fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-layer-base p-2 lg:flex lg:flex-col ${sidebarCollapsed ? 'w-14' : 'w-60'}`}
          >
            <div className="flex h-12 min-w-0 items-center gap-2">
              <Button
                aria-label={
                  sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'
                }
                className="size-10 shrink-0 p-0"
                onClick={() =>
                  setSidebarCollapsed((current) => !current)
                }
                variant="ghost"
              >
                <Icon
                  name={sidebarCollapsed ? 'panel-open' : 'panel-close'}
                />
              </Button>
              {sidebarCollapsed ? null : (
                <div className="min-w-0 flex-1">
                  <Brand compact={false} />
                </div>
              )}
            </div>
            <div
              className="mt-2 border-b border-border pb-3"
            >
              <MiniAppSwitcher
                collapsed={sidebarCollapsed}
                currentMiniApp={currentMiniApp}
                miniApps={miniApps}
              />
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <InnerNavigation
                collapsed={sidebarCollapsed}
                items={currentMiniApp.items}
              />
            </div>
            <div className="mt-3 border-t border-border pt-2">
              <SettingsNavigation
                collapsed={sidebarCollapsed}
                path={currentMiniApp.settingsPath}
              />
            </div>
          </aside>
        )}

        <div
          className={isImmersiveMonitoringRoute
            ? undefined
            : sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-60'}
        >
          <main
              className={isMonitoringRoute
              ? 'min-w-0 w-full p-0'
              : 'mx-auto min-w-0 w-full max-w-[100rem] p-[var(--layout-page-gutter)]'}
            data-page-shell={isMonitoringRoute ? 'full-bleed' : 'standard'}
            id="main-content"
            ref={mainContentRef}
            tabIndex={-1}
          >
            <Suspense fallback={<QueryFeedback kind="loading" />}>
              <PageFrame layout={pageFrameLayout}>
                <Outlet />
              </PageFrame>
            </Suspense>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
