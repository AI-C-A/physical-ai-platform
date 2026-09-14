import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams, type To } from 'react-router-dom';


import {
  RobotInfoOverview,
  RobotScenePreview,
  useRobotCatalog,
  useRobotOperationalStatuses,
  type RobotDescriptor,
  type RobotOperationalStatus,
} from '@/entities/robot';
import {
  monitoringSites,
  type SiteDescriptor,
} from '@/entities/site';
import {
  useRobotGeolocation,
} from '@/entities/robot-telemetry';
import { appendPathSegment } from '@/shared/lib/navigation';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { Brand } from '@/shared/ui/brand';
import { Icon } from '@/shared/ui/icon';
import { SearchField } from '@/shared/ui/search-field';
import { Panel } from '@/shared/ui/panel';
import { useRouteMorph } from '@/shared/ui/route-morph';
import { Select } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

import {
  isMultiMonitoringSelectionMode,
  maximumMultiMonitoringRobotCount,
  minimumMultiMonitoringRobotCount,
  multiMonitoringModeSearchParameter,
  multiMonitoringRobotIdSearchParameter,
  readMultiMonitoringRobotIds,
  setMultiMonitoringSelectionMode,
  writeMultiMonitoringRobotIds,
} from '../model/multi-monitoring-search-params';
import {
  filterMonitoringRobots,
  needsMonitoringAttention,
} from '../model/monitoring-robot-health';
import { RobotMultiSelectionList } from './RobotMultiSelectionList';
import { getRobotMapLocation, type FleetMapLocation } from '../model/monitoring-map-locations';
import { SiteMap } from './MonitoringMap';
import {
  RobotMonitoringListRow,
  robotMonitoringListClassName,
} from './RobotMonitoringListRow';

const monitoringViewportClassName =
  'relative h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden lg:h-dvh';
const siteIdSearchParameter = 'siteId';
const emptyOperationalStatuses: Readonly<Record<string, RobotOperationalStatus | null>> = {};

const siteOptions = monitoringSites.map((site) => ({
  label: site.displayName,
  value: site.id,
}));


interface MonitoringLayoutProps {
  readonly fleetLocations: readonly FleetMapLocation[];
  readonly isMultiSelectMode: boolean;
  readonly monitoredRobots: readonly RobotDescriptor[];
  readonly multiMonitoringTarget: To;
  readonly onCancelMultiSelect: () => void;
  readonly onCloseRobotInfo: () => void;
  readonly onEnterMultiSelect: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onRefreshStatuses: () => void;
  readonly onSelectRobot: (robotId: string) => void;
  readonly onSelectSite: (siteId: string) => void;
  readonly onToggleMultiRobot: (robotId: string) => void;
  readonly operationalStatuses: Readonly<Record<string, RobotOperationalStatus | null>>;
  readonly operationalStatusQuery: ReturnType<typeof useRobotOperationalStatuses>;
  readonly robotCatalogQuery: ReturnType<typeof useRobotCatalog>;
  readonly robotMonitoringSearch: string;
  readonly search: string;
  readonly selectedMultiRobotIds: readonly string[];
  readonly selectedRobot: RobotDescriptor | undefined;
  readonly selectedSite: SiteDescriptor;
  readonly staleRobotIds: ReadonlySet<string>;
  readonly statusesUnavailable: boolean;
  readonly totalRobotCount: number;
}

function MonitoringLayout({
  fleetLocations,
  isMultiSelectMode,
  monitoredRobots,
  multiMonitoringTarget,
  onCancelMultiSelect,
  onCloseRobotInfo,
  onEnterMultiSelect,
  onSearchChange,
  onRefreshStatuses,
  onSelectRobot,
  onSelectSite,
  onToggleMultiRobot,
  operationalStatuses,
  operationalStatusQuery,
  robotCatalogQuery,
  robotMonitoringSearch,
  search,
  selectedMultiRobotIds,
  selectedRobot,
  selectedSite,
  staleRobotIds,
  statusesUnavailable,
  totalRobotCount,
}: MonitoringLayoutProps) {
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const mobileListToggleRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const multiSelectActionRef = useRef<HTMLButtonElement>(null);
  const restoreMultiSelectActionFocusRef = useRef(false);
  const hasRobots = robotCatalogQuery.status === 'ready' && totalRobotCount > 0;
  const robotMonitoringMorph = useRouteMorph(
    selectedRobot === undefined
      ? 'control-monitoring:unselected'
      : `control-monitoring:${selectedRobot.id}`,
  );
  const multiMonitoringMorph = useRouteMorph('control-monitoring:multi');
  useEffect(() => {
    if (isMultiSelectMode || !restoreMultiSelectActionFocusRef.current) return;
    restoreMultiSelectActionFocusRef.current = false;
    multiSelectActionRef.current?.focus();
  }, [isMultiSelectMode]);
  const desktopGridColumnsClassName = selectedRobot === undefined
    ? 'md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)_0rem] xl:grid-cols-[minmax(14rem,17rem)_minmax(22rem,1fr)_0rem]'
    : 'md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)_minmax(17rem,20rem)] xl:grid-cols-[minmax(14rem,17rem)_minmax(22rem,1fr)_minmax(20rem,23rem)]';

  return (
    <>
      <div className={mobileListOpen && hasRobots ? 'max-md:invisible' : undefined}>
        <SelectedRobotSiteMap
          robots={robotCatalogQuery.status === 'ready' ? robotCatalogQuery.robots : []}
          fleetLocations={fleetLocations}
          onSelectRobot={onSelectRobot}
          robot={selectedRobot}
          site={selectedSite}
        />
      </div>
      <div
        className={[
          'pointer-events-none relative z-10 grid h-full min-h-0 grid-cols-[minmax(0,1fr)] gap-4 overflow-hidden p-4 transition-[grid-template-columns,grid-template-rows] duration-200 motion-reduce:transition-none md:grid-rows-[minmax(0,1fr)]',
          mobileListOpen ? 'grid-rows-[minmax(0,1fr)]' : 'grid-rows-[auto_minmax(0,1fr)]',
          desktopGridColumnsClassName,
        ].join(' ')}
      >
        <div className="pointer-events-none flex max-h-full min-h-0 min-w-0 flex-col gap-3 self-start">
          <Panel className="monitoring-context-panel pointer-events-auto shrink-0" contentClassName="grid" layer="translucent">
            <div className="monitoring-context-brand">
              <Brand compact={false} stacked />
            </div>
            <Select
              className="pointer-events-auto min-w-0 shrink-0"
              controlSize="large"
              label="사이트"
              leadingIcon="location"
              onValueChange={onSelectSite}
              options={siteOptions}
              showLabel={false}
              value={selectedSite.id}
            />
          </Panel>

          <Button
            aria-controls="monitoring-robot-list"
            aria-expanded={mobileListOpen}
            className="pointer-events-auto min-h-12 shrink-0 justify-between md:hidden"
            onClick={() => setMobileListOpen((open) => !open)}
            buttonRef={mobileListToggleRef}
            variant="secondary"
          >
            {mobileListOpen ? '목록 접고 지도 보기' : hasRobots ? `로봇 목록 보기 · ${String(monitoredRobots.length)}대` : '로봇 목록 보기'}
            <span className={mobileListOpen ? 'rotate-180' : undefined}><Icon name="chevron-down" /></span>
          </Button>

          <Panel
            aria-label="로봇 선택"
            className={`${mobileListOpen ? 'flex' : 'hidden md:flex'} pointer-events-auto min-h-0 flex-col overflow-hidden p-0`}
            contentClassName="flex min-h-0 flex-1 flex-col"
            id="monitoring-robot-list"
            layer="translucent"
            onKeyDown={(event) => {
              if (
                !isMultiSelectMode
                || event.defaultPrevented
                || event.key !== 'Escape'
              ) return;
              event.preventDefault();
              restoreMultiSelectActionFocusRef.current = true;
              onCancelMultiSelect();
            }}
          >
            {hasRobots ? (
              <>
            <div className="flex shrink-0 items-center gap-2 p-3">
              <SearchField
                className="min-w-0 flex-1"
                inputRef={searchInputRef}
                label="로봇 검색"
                onValueChange={onSearchChange}
                placeholder="로봇 검색"
                showLabel={false}
                value={search}
              />
              <Button
                aria-label={isMultiSelectMode ? '선택 취소' : '다중 선택'}
                buttonRef={multiSelectActionRef}
                className="min-w-12 shrink-0 border-0 px-3 text-xs font-medium text-muted hover:text-foreground"
                onClick={isMultiSelectMode
                  ? onCancelMultiSelect
                  : onEnterMultiSelect}
                variant="ghost"
              >
                {isMultiSelectMode ? '취소' : '선택'}
              </Button>
            </div>
            {statusesUnavailable || staleRobotIds.size > 0 ? (
              <div className="mx-3 mb-3 rounded-[var(--design-radius-control)] bg-status-warning-background p-3 text-xs text-status-warning-foreground" role="status">
                <p>{statusesUnavailable ? '로봇 상태를 불러오지 못했습니다.' : `${String(staleRobotIds.size)}대의 상태 수신이 지연되고 있습니다.`}</p>
                <Button className="mt-2 min-h-10 px-2 text-xs" onClick={onRefreshStatuses} variant="secondary">상태 다시 확인</Button>
              </div>
            ) : null}
              </>
            ) : null}
            {!hasRobots ? (
              <div className="min-h-0 overflow-y-auto p-3 text-sm leading-relaxed">
                {robotCatalogQuery.status === 'loading' ? (
                  <div className="flex items-center gap-2 text-muted" role="status" aria-label="불러오는 중">
                    <Spinner />
                    로봇 목록을 불러오는 중입니다.
                  </div>
                ) : robotCatalogQuery.status === 'error' ? (
                  <>
                    <p className="break-keep text-muted" role="alert">{robotCatalogQuery.message}</p>
                    <Button className="mt-3 min-h-10 text-xs" onClick={robotCatalogQuery.retry} variant="secondary">다시 시도</Button>
                  </>
                ) : (
                  <p className="text-muted" role="status">등록된 로봇이 없습니다.</p>
                )}
              </div>
            ) : monitoredRobots.length === 0 ? (
              <div className="px-3 py-6 text-sm" role="status">
                <p className="font-medium">조건에 맞는 로봇이 없습니다.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">다른 이름이나 ID로 검색해 보세요.</p>
                <Button className="mt-3 min-h-10 text-xs" onClick={() => { onSearchChange(''); searchInputRef.current?.focus(); }} variant="secondary">검색 지우기</Button>
              </div>
            ) : isMultiSelectMode ? (
              <RobotMultiSelectionList
                maximumSelection={maximumMultiMonitoringRobotCount}
                onToggleRobot={onToggleMultiRobot}
                operationalStatuses={operationalStatuses}
                robots={monitoredRobots}
                selectedRobotIds={selectedMultiRobotIds}
                staleRobotIds={staleRobotIds}
              />
            ) : (
              <ul className={robotMonitoringListClassName}>
                {monitoredRobots.map((robot) => {
                  const isSelected = selectedRobot?.id === robot.id;
                  return (
                    <li key={robot.id}>
                      <RobotMonitoringListRow
                        isStale={staleRobotIds.has(robot.id)}
                        isSelected={isSelected}
                        mode="single"
                        operationalStatus={operationalStatuses[robot.id]}
                        onActivate={() => {
                          onSelectRobot(robot.id);
                          setMobileListOpen(false);
                          if (mobileListToggleRef.current?.getClientRects().length) mobileListToggleRef.current.focus();
                        }}
                        robot={robot}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            {isMultiSelectMode && hasRobots ? (
              <div className="mt-2 shrink-0 border-t border-border/70 p-3">
                <Button
                  {...multiMonitoringMorph.getTriggerProps(multiMonitoringTarget)}
                  aria-label="다중 관제 시작"
                  className="w-full"
                  disabled={
                    robotCatalogQuery.status !== 'ready'
                    || selectedMultiRobotIds.length
                    < minimumMultiMonitoringRobotCount
                  }
                >
                  <Icon name="play" />
                  다중 관제 시작
                  <span
                    aria-live="polite"
                    className="tabular-nums opacity-70"
                  >
                    {String(selectedMultiRobotIds.length)}/{String(maximumMultiMonitoringRobotCount)}
                  </span>
                </Button>
              </div>
            ) : null}
          </Panel>
        </div>

        {selectedRobot === undefined ? null : (
          <Panel
            aria-label={`${selectedRobot.displayName} 로봇 패널`}
            className={`pointer-events-auto relative ${mobileListOpen ? 'hidden md:flex' : 'flex'} min-h-0 flex-col overflow-hidden max-md:max-h-[45dvh] max-md:self-end md:col-start-3 md:row-start-1`}
            contentClassName="flex min-h-0 flex-1 flex-col"
            layer="translucent"
          >
            <div className="relative z-30 flex shrink-0 justify-end gap-1">
              <Link
                aria-label={`${selectedRobot.displayName} 크게 보기`}
                title="크게 보기"
                className={getButtonClassName('ghost', 'size-10 min-h-10 p-0 text-muted shadow-none')}
                to={{ pathname: '/control/monitoring/carousel', search: new URLSearchParams({ siteId: selectedSite.id, robotId: selectedRobot.id }).toString() }}
              >
                <Icon name="maximize" />
              </Link>
              <Button
                aria-label="로봇 정보 패널 닫기"
                className="size-10 min-h-10 p-0 text-muted shadow-none"
                onClick={onCloseRobotInfo}
                variant="ghost"
              >
                <Icon name="close" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-4">
                <SelectedRobotInfo robot={selectedRobot} statusQuery={operationalStatusQuery} />
              </div>
            </div>
            <Link
              {...robotMonitoringMorph.getTriggerProps({
                pathname: appendPathSegment('/control/monitoring', selectedRobot.id),
                search: robotMonitoringSearch,
              })}
              className={getButtonClassName(
                'primary',
                'mt-4 min-h-12 w-full shrink-0 rounded-[var(--design-radius-control)] border-0',
              )}
              to={{
                pathname: appendPathSegment('/control/monitoring', selectedRobot.id),
                search: robotMonitoringSearch,
              }}
            >
              <Icon name="play" />
              영상 관제
            </Link>
          </Panel>
        )}
      </div>
    </>
  );
}

function SelectedRobotInfo({ robot, statusQuery }: {
  readonly robot: RobotDescriptor;
  readonly statusQuery: ReturnType<typeof useRobotOperationalStatuses>;
}) {
  const streamIssue = statusQuery.streamIssuesByRobotId[robot.id] ?? null;
  const refreshError = streamIssue?.message
    ?? (statusQuery.refreshError === statusQuery.streamIssue?.message ? null : statusQuery.refreshError);
  const operationalStatus = statusQuery.status === 'ready'
    ? { ...statusQuery, data: statusQuery.data[robot.id] ?? null, refreshError, streamIssue }
    : statusQuery.status === 'error'
      ? { ...statusQuery, message: '로봇 정보를 불러오지 못했습니다.', streamIssue }
      : { ...statusQuery, streamIssue };
  const robotNickname = operationalStatus.status === 'ready'
    && operationalStatus.data !== null
    ? operationalStatus.data.data.nickname
    : null;

  return (
    <>
      <RobotScenePreview robot={robot} nickname={robotNickname ?? robot.displayName} />
      <RobotInfoOverview operationalStatus={operationalStatus} robot={robot} />
    </>
  );
}

function SelectedRobotSiteMap({
  robots,
  fleetLocations,
  onSelectRobot,
  robot,
  site,
}: {
  readonly robots: readonly RobotDescriptor[];
  readonly fleetLocations: readonly FleetMapLocation[];
  readonly onSelectRobot: (robotId: string) => void;
  readonly robot: RobotDescriptor | undefined;
  readonly site: SiteDescriptor;
}) {
  const geolocation = useRobotGeolocation(
    robot === undefined || site.environment === 'indoor' ? null : robot.id,
  );
  return <SiteMap robots={robots} fleetLocations={fleetLocations} geolocation={geolocation} onSelectRobot={onSelectRobot} robot={robot} site={site} />;
}

export function ControlMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRobotId = searchParams.get('robotId');
  const setSelectedRobotId = (id: string | null) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (id) next.set('robotId', id); else next.delete('robotId');
    return next;
  }, { replace: true });
  const [search, setSearch] = useState('');
  const robots = useRobotCatalog();
  const multiSelectMode = isMultiMonitoringSelectionMode(searchParams);
  const selectedMultiRobotIds = useMemo(
    () => readMultiMonitoringRobotIds(searchParams),
    [searchParams],
  );
  const robotIds = useMemo(() => robots.robots.map((robot) => robot.id), [robots.robots]);
  const operationalStatuses = useRobotOperationalStatuses(robotIds);
  const statuses = operationalStatuses.status === 'ready'
    ? operationalStatuses.data : emptyOperationalStatuses;
  const staleRobotIds = useMemo(
    () => new Set(Object.keys(operationalStatuses.streamIssuesByRobotId)),
    [operationalStatuses.streamIssuesByRobotId],
  );
  const fleetLocations = useMemo(() => robots.robots.flatMap((robot): FleetMapLocation[] => {
    const status = statuses[robot.id];
    const latitude = status?.data.latitude;
    const longitude = status?.data.longitude;
    if (status == null || latitude == null || longitude == null || (latitude === 0 && longitude === 0)) return [];
    const location = getRobotMapLocation(robot, {
      robotId: robot.id,
      latitudeDegrees: latitude,
      longitudeDegrees: longitude,
      horizontalAccuracyMeters: null,
      sourceTimestampMs: null,
      receivedTimestampMs: status.receivedTimestampMs,
    });
    return location === null ? [] : [{
      ...location,
      robotId: robot.id,
      needsAttention: needsMonitoringAttention(status, staleRobotIds.has(robot.id)),
    }];
  }), [robots.robots, staleRobotIds, statuses]);
  const requestedSiteId = searchParams.get(siteIdSearchParameter);
  const selectedSite = monitoringSites.find((site) => site.id === requestedSiteId)
    ?? monitoringSites[0];
  const robotMonitoringSearchParams = new URLSearchParams(searchParams);
  robotMonitoringSearchParams.set(siteIdSearchParameter, selectedSite.id);
  robotMonitoringSearchParams.delete(multiMonitoringModeSearchParameter);
  robotMonitoringSearchParams.delete(multiMonitoringRobotIdSearchParameter);
  const robotMonitoringSearch = `?${robotMonitoringSearchParams.toString()}`;
  const multiMonitoringSearchParams = setMultiMonitoringSelectionMode(
    writeMultiMonitoringRobotIds(searchParams, selectedMultiRobotIds),
    true,
  );
  const multiMonitoringTarget: To = {
    pathname: '/control/monitoring/multi',
    search: `?${multiMonitoringSearchParams.toString()}`,
  };

  useEffect(() => {
    if (requestedSiteId === selectedSite.id) return;

    setSearchParams((currentSearchParams) => {
      const nextSearchParams = new URLSearchParams(currentSearchParams);
      nextSearchParams.set(siteIdSearchParameter, selectedSite.id);
      return nextSearchParams;
    }, { replace: true });
  }, [requestedSiteId, selectedSite.id, setSearchParams]);

  useEffect(() => {
    if (!multiSelectMode || robots.status !== 'ready') return;
    const availableRobotIds = new Set(robots.robots.map((robot) => robot.id));
    const validRobotIds = selectedMultiRobotIds.filter((robotId) =>
      availableRobotIds.has(robotId));
    if (validRobotIds.length === selectedMultiRobotIds.length) return;

    setSearchParams((currentSearchParams) =>
      writeMultiMonitoringRobotIds(currentSearchParams, validRobotIds), {
      replace: true,
    });
  }, [
    multiSelectMode,
    robots.robots,
    robots.status,
    selectedMultiRobotIds,
    setSearchParams,
  ]);

  const monitoredRobots = useMemo(() => filterMonitoringRobots({
    filter: 'all',
    robots: robots.robots,
    search,
    sort: 'name',
    staleRobotIds,
    statuses,
  }), [robots.robots, search, staleRobotIds, statuses]);
  const selectedRobot = !multiSelectMode
    && robots.status === 'ready'
    && selectedRobotId !== null
    ? robots.robots.find((robot) => robot.id === selectedRobotId)
    : undefined;

  const layoutProps = {
    fleetLocations,
    isMultiSelectMode: multiSelectMode,
    monitoredRobots,
    multiMonitoringTarget,
    onCancelMultiSelect: () => {
      setSearchParams((currentSearchParams) =>
        setMultiMonitoringSelectionMode(currentSearchParams, false), {
        replace: true,
      });
    },
    onCloseRobotInfo: () => setSelectedRobotId(null),
    onEnterMultiSelect: () => {
      setSelectedRobotId(null);
      setSearchParams((currentSearchParams) =>
        setMultiMonitoringSelectionMode(currentSearchParams, true), {
        replace: true,
      });
    },
    onSearchChange: setSearch,
    onRefreshStatuses: operationalStatuses.retry,
    onSelectRobot: setSelectedRobotId,
    onSelectSite: (siteId: string) => {
      if (!monitoringSites.some((site) => site.id === siteId)) return;

      setSearchParams((currentSearchParams) => {
        const nextSearchParams = new URLSearchParams(currentSearchParams);
        nextSearchParams.set(siteIdSearchParameter, siteId);
        return nextSearchParams;
      });
    },
    onToggleMultiRobot: (robotId: string) => {
      const isSelected = selectedMultiRobotIds.includes(robotId);
      if (
        !isSelected
        && selectedMultiRobotIds.length >= maximumMultiMonitoringRobotCount
      ) return;
      const nextRobotIds = isSelected
        ? selectedMultiRobotIds.filter((selectedId) => selectedId !== robotId)
        : [...selectedMultiRobotIds, robotId];
      setSearchParams((currentSearchParams) =>
        writeMultiMonitoringRobotIds(currentSearchParams, nextRobotIds), {
        replace: true,
      });
    },
    operationalStatuses: statuses,
    operationalStatusQuery: operationalStatuses,
    robotCatalogQuery: robots,
    robotMonitoringSearch,
    search,
    selectedMultiRobotIds,
    selectedRobot,
    selectedSite,
    staleRobotIds,
    statusesUnavailable: operationalStatuses.status === 'error',
    totalRobotCount: robots.robots.length,
  };

  return (
    <div className={monitoringViewportClassName}>
      <h1 className="sr-only">모니터링</h1>
      <MonitoringLayout {...layoutProps} />
    </div>
  );
}
