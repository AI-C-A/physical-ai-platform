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
import { cn } from '@/shared/ui/class-names';
import { Icon, type IconName } from '@/shared/ui/icon';
import { PageFrame, type PageFrameLayout } from '@/shared/ui/page-frame';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Sheet } from '@/shared/ui/sheet';
import { getFloatingSurfaceClassName } from '@/shared/ui/surface';
import { Tooltip, TooltipProvider } from '@/shared/ui/tooltip';

import { AppLauncher } from './AppLauncher';
import './platform-shell.css';

const sidebarCollapsedStorageKey =
  'army-robot.platform-shell.collapsed.v1';

export interface MiniAppNavigationChild {
  readonly activePaths?: readonly string[];
  readonly icon: IconName;
  readonly label: string;
  readonly path: string;
}

export interface MiniAppNavigationGroup {
  readonly id: string;
  readonly items: readonly MiniAppNavigationChild[];
  readonly label: string;
}

type MiniAppNavigationEntry = MiniAppNavigationChild | MiniAppNavigationGroup;

export interface MiniAppNavigationItem {
  readonly description?: string;
  readonly homePath: string;
  readonly icon: IconName;
  readonly id: string;
  readonly items: readonly MiniAppNavigationEntry[];
  readonly label: string;
  readonly settingsPath: string;
}

interface PlatformShellProps {
  readonly miniApps: readonly MiniAppNavigationItem[];
}

function getMatchingNavigationPath(
  pathname: string,
  item: MiniAppNavigationChild,
): string | undefined {
  return [item.path, ...(item.activePaths ?? [])]
    .filter((path) => pathname === path || pathname.startsWith(path + '/'))
    .sort((left, right) => right.length - left.length)[0];
}

function isNavigationItemActive(
  pathname: string,
  item: MiniAppNavigationChild,
): boolean {
  return getMatchingNavigationPath(pathname, item) !== undefined;
}

function getRouteLabel(
  pathname: string,
  miniApps: readonly MiniAppNavigationItem[],
): string {
  if (pathname === '/') {
    const firstEntry = miniApps[0]?.items[0];
    return firstEntry === undefined
      ? '플랫폼'
      : 'path' in firstEntry
        ? firstEntry.label
        : firstEntry.items[0]?.label ?? firstEntry.label;
  }

  if (miniApps.some((miniApp) => pathname === miniApp.settingsPath)) {
    return '설정';
  }

  const matchingItems = miniApps
    .flatMap((miniApp) => miniApp.items.flatMap((entry) => (
      'path' in entry ? [entry] : entry.items
    )))
    .map((item) => ({
      item,
      matchingPath: getMatchingNavigationPath(pathname, item),
    }))
    .filter((match) => match.matchingPath !== undefined)
    .sort(
      (left, right) =>
        (right.matchingPath?.length ?? 0) - (left.matchingPath?.length ?? 0),
    );

  return matchingItems[0]?.item.label ?? '페이지를 찾을 수 없습니다';
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
          : 'flex min-h-12 min-w-0 items-center gap-2'
      }
      to={{
        pathname: '/control/monitoring',
        search: siteSelectionSearch,
      }}
    >
      {branding.logo === null ? (
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center text-xs font-bold"
        >
          AR
        </span>
      ) : (
        <img
          alt=""
          className="size-7 shrink-0 object-contain"
          src={branding.logo}
        />
      )}
      {compact ? null : (
        <span className="min-w-0">
          <strong className="block text-xs font-semibold leading-tight">
            {branding.productName}
          </strong>
        </span>
      )}
    </Link>
  );
}

function MiniAppHeader({
  currentMiniApp,
  miniApps,
  onNavigate,
}: {
  readonly currentMiniApp: MiniAppNavigationItem;
  readonly miniApps: readonly MiniAppNavigationItem[];
  readonly onNavigate?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex min-w-0 items-center justify-start">
      <AppLauncher
        currentMiniApp={currentMiniApp}
        miniApps={miniApps}
        onSelect={(miniApp) => {
          void navigate({
            pathname: miniApp.homePath,
            search: getSiteSelectionSearch(location.search),
          });
          onNavigate?.();
        }}
      />
    </div>
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
  return (
    <nav
      aria-label="미니앱 업무 메뉴"
      className="grid min-w-0 gap-1"
    >
      {items.map((entry) => {
        if (!('path' in entry)) {
          return (
            <NavigationGroup
              collapsed={collapsed}
              group={entry}
              key={entry.id}
              {...(onNavigate === undefined ? {} : { onNavigate })}
            />
          );
        }
        return (
          <NavigationLink
            collapsed={collapsed}
            item={entry}
            key={entry.path}
            {...(onNavigate === undefined ? {} : { onNavigate })}
          />
        );
      })}
    </nav>
  );
}

function NavigationGroup({
  collapsed,
  group,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly group: MiniAppNavigationGroup;
  readonly onNavigate?: () => void;
}) {
  return (
    <section aria-label={group.label} className="mt-6 min-w-0 first:mt-0">
      <h2
        aria-hidden={collapsed}
        className="platform-shell-label mb-2 overflow-hidden whitespace-nowrap px-3 py-1 text-xs font-medium text-navigation-label"
        data-hidden={collapsed}
      >
        {group.label}
      </h2>
      <div className="grid gap-1">
        {group.items.map((item) => (
          <NavigationLink
            collapsed={collapsed}
            item={item}
            key={item.path}
            {...(onNavigate === undefined ? {} : { onNavigate })}
          />
        ))}
      </div>
    </section>
  );
}

function getNavigationClassName(isActive: boolean) {
  return cn(
    'ui-pressable ui-pressable--subtle ui-navigation-item ui-focus-inset flex min-h-11 min-w-0 items-center gap-3 overflow-hidden px-3 py-2 text-sm',
    isActive
      ? 'font-semibold'
      : 'font-normal',
  );
}

function NavigationLink({
  collapsed,
  item,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly item: MiniAppNavigationChild;
  readonly onNavigate?: () => void;
}) {
  const location = useLocation();
  const siteSelectionSearch = getSiteSelectionSearch(location.search);
  const isActive = isNavigationItemActive(location.pathname, item);
  const link = (
    <Link
      aria-current={isActive ? 'page' : undefined}
      aria-label={item.label}
      className={getNavigationClassName(isActive)}
      onClick={onNavigate}
      to={{ pathname: item.path, search: siteSelectionSearch }}
    >
      <span className="shrink-0">
        <Icon name={item.icon} />
      </span>
      <span aria-hidden="true" className="platform-shell-label shrink-0 whitespace-nowrap" data-hidden={collapsed}>
        {item.label}
      </span>
    </Link>
  );
  return <Tooltip content={item.label} disabled={!collapsed} trigger={link} />;
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
      className={getNavigationClassName(isActive)}
      onClick={onNavigate}
      to={{
        pathname: path,
        search: siteSelectionSearch,
      }}
    >
      <span className="shrink-0">
        <Icon name="settings" />
      </span>
      <span aria-hidden="true" className="platform-shell-label shrink-0 whitespace-nowrap" data-hidden={collapsed}>
        설정
      </span>
    </NavLink>
  );

  return <Tooltip content="설정" disabled={!collapsed} trigger={link} />;
}

export function PlatformShell({ miniApps }: PlatformShellProps) {
  const branding = useBranding();
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);
  const mobileMenuNavigationRef = useRef(false);
  const previousPathnameRef = useRef<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    readSidebarCollapsed,
  );
  const closeMobileMenuForNavigation = () => {
    mobileMenuNavigationRef.current = true;
    setMobileMenuOpen(false);
  };
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
  const isImmersiveCaptureRoute =
    location.pathname !== '/mlops/collection/new'
    && /^\/mlops\/collection\/[^/]+$/u.test(location.pathname);
  const isImmersiveRoute =
    isImmersiveMonitoringRoute || isImmersiveCaptureRoute;
  const isFullBleedRoute = isMonitoringRoute || isImmersiveCaptureRoute;
  const pageFrameLayout: PageFrameLayout = isImmersiveRoute
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
      || location.pathname === '/mlops/collection/new'
      || /^\/mlops\/collection\/[^/]+\/setup$/u.test(location.pathname)
      || ((previousPathname === '/mlops/collection/new' || /^\/mlops\/collection\/[^/]+\/setup$/u.test(previousPathname)) && location.pathname === '/mlops/collection')
    ) {
      return;
    }

    if (mobileMenuNavigationRef.current) return;
    const focusTimer = window.setTimeout(
      () => mainContentRef.current?.focus(),
      0,
    );

    return () => window.clearTimeout(focusTimer);
  }, [location.pathname]);

  if (currentMiniApp === undefined) return <Outlet />;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <a
          className={cn(
            'sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--design-radius-control)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:ring-2 focus:ring-focus',
            getFloatingSurfaceClassName(),
          )}
          href="#main-content"
          onClick={() => mainContentRef.current?.focus()}
        >
          본문으로 건너뛰기
        </a>
        {isImmersiveRoute ? null : (
          <header className="sticky top-0 z-30 bg-navigation-background lg:hidden">
            <div className="flex min-h-14 items-center gap-3 px-4">
              <Sheet
                hideTitle
                onCloseAutoFocus={(event) => {
                  if (!mobileMenuNavigationRef.current) return;
                  event.preventDefault();
                  mobileMenuNavigationRef.current = false;
                  mainContentRef.current?.focus();
                }}
                onOpenChange={(open) => {
                  if (open) mobileMenuNavigationRef.current = false;
                  setMobileMenuOpen(open);
                }}
                open={mobileMenuOpen}
                title={`${branding.productName} 메뉴`}
                trigger={
                  <Button aria-label="업무 메뉴 열기" className="size-11 shrink-0 p-0" variant="ghost">
                    <Icon name="menu" size="md" />
                  </Button>
                }
              >
                <div className="flex h-full min-h-0 flex-col gap-5">
                  <MiniAppHeader
                    currentMiniApp={currentMiniApp}
                    miniApps={miniApps}
                    onNavigate={closeMobileMenuForNavigation}
                  />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <InnerNavigation
                      collapsed={false}
                      items={currentMiniApp.items}
                      onNavigate={closeMobileMenuForNavigation}
                    />
                  </div>
                  <div className="pt-3">
                    <SettingsNavigation
                      collapsed={false}
                      onNavigate={closeMobileMenuForNavigation}
                      path={currentMiniApp.settingsPath}
                    />
                  </div>
                </div>
              </Sheet>
              <Brand compact={false} />
            </div>
          </header>
        )}

        {isImmersiveRoute ? null : (
          <aside
            className={`platform-shell-sidebar fixed inset-y-0 left-0 z-30 hidden overflow-x-hidden bg-navigation-background p-2 lg:flex lg:flex-col ${sidebarCollapsed ? 'w-14' : 'w-60'}`}
          >
            <div className="flex min-h-13 min-w-0 items-center pt-1">
              <div
                aria-hidden={sidebarCollapsed}
                className="platform-shell-launcher min-w-0 flex-1 overflow-hidden"
                data-hidden={sidebarCollapsed}
                inert={sidebarCollapsed}
              >
                <div className="w-46">
                  <MiniAppHeader
                    currentMiniApp={currentMiniApp}
                    miniApps={miniApps}
                  />
                </div>
              </div>
              <Button
                aria-expanded={!sidebarCollapsed}
                aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                className="platform-shell-toggle relative size-10 shrink-0 p-0 text-muted"
                onClick={() => setSidebarCollapsed((current) => !current)}
                title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                variant="ghost"
              >
                <span aria-hidden="true" className="platform-shell-label absolute" data-hidden={!sidebarCollapsed}>
                  <Icon name="panel-open" />
                </span>
                <span aria-hidden="true" className="platform-shell-label absolute" data-hidden={sidebarCollapsed}>
                  <Icon name="panel-close" />
                </span>
              </Button>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <InnerNavigation
                collapsed={sidebarCollapsed}
                items={currentMiniApp.items}
              />
            </div>
            <div className="mt-4 pt-2">
              <SettingsNavigation
                collapsed={sidebarCollapsed}
                path={currentMiniApp.settingsPath}
              />
            </div>
          </aside>
        )}

        <div
          className={isImmersiveRoute
            ? undefined
            : cn('platform-shell-content', sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-60')}
        >
          <main
              className={isFullBleedRoute
              ? 'min-w-0 w-full p-0'
              : 'mx-auto min-w-0 w-full max-w-[100rem] p-[var(--layout-page-gutter)]'}
            data-page-shell={isFullBleedRoute ? 'full-bleed' : 'standard'}
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
