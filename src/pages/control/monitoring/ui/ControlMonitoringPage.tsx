import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams, type To } from 'react-router-dom';


import {
  RobotInfoOverview,
  RobotModelViewer,
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
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { useRouteMorph } from '@/shared/ui/route-morph';
import { Select } from '@/shared/ui/select';

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
  type MonitoringRobotFilter,
  type MonitoringRobotSort,
} from '../model/monitoring-robot-health';
import { RobotMultiSelectionList } from './RobotMultiSelectionList';
import { getRobotMapLocation, type FleetMapLocation } from '../model/monitoring-map-locations';
import { mapOverlaySurfaceClassName, SiteMap } from './MonitoringMap';
import {
  RobotMonitoringListRow,
  robotMonitoringListClassName,
} from './RobotMonitoringListRow';

const monitoringViewportClassName =
  'relative h-[calc(100dvh-3.5rem-var(--platform-environment-height,0rem))] min-h-0 overflow-hidden lg:h-[calc(100dvh-var(--platform-environment-height,0rem))]';
const mapOverlayControlClassName =
  'min-h-12 rounded-md border-0 px-4 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset';
const siteIdSearchParameter = 'siteId';
const emptyOperationalStatuses: Readonly<Record<string, RobotOperationalStatus | null>> = {};

const siteOptions = monitoringSites.map((site) => ({
  label: site.displayName,
  value: site.id,
}));


interface MonitoringLayoutProps {
  readonly fleetLocations: readonly FleetMapLocation[];
  readonly attentionCount: number;
  readonly connectedCount: number;
  readonly filter: MonitoringRobotFilter;
  readonly isMultiSelectMode: boolean;
  readonly monitoredRobots: readonly RobotDescriptor[];
  readonly multiMonitoringTarget: To;
  readonly onCancelMultiSelect: () => void;
  readonly onCloseRobotInfo: () => void;
  readonly onEnterMultiSelect: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onFilterChange: (value: MonitoringRobotFilter) => void;
  readonly onSortChange: (value: MonitoringRobotSort) => void;
  readonly onRefreshStatuses: () => void;
  readonly onSelectRobot: (robotId: string) => void;
  readonly onSelectSite: (siteId: string) => void;
  readonly onToggleMultiRobot: (robotId: string) => void;
  readonly operationalStatuses: Readonly<Record<string, RobotOperationalStatus | null>>;
  readonly operationalStatusQuery: ReturnType<typeof useRobotOperationalStatuses>;
  readonly robotMonitoringSearch: string;
  readonly search: string;
  readonly selectedMultiRobotIds: readonly string[];
  readonly selectedRobot: RobotDescriptor | undefined;
  readonly selectedSite: SiteDescriptor;
  readonly sort: MonitoringRobotSort;
  readonly staleRobotIds: ReadonlySet<string>;
  readonly statusesUnavailable: boolean;
  readonly totalRobotCount: number;
}

function MonitoringLayout({
  fleetLocations,
  attentionCount,
  connectedCount,
  filter,
  isMultiSelectMode,
  monitoredRobots,
  multiMonitoringTarget,
  onCancelMultiSelect,
  onCloseRobotInfo,
  onEnterMultiSelect,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onRefreshStatuses,
  onSelectRobot,
  onSelectSite,
  onToggleMultiRobot,
  operationalStatuses,
  operationalStatusQuery,
  robotMonitoringSearch,
  search,
  selectedMultiRobotIds,
  selectedRobot,
  selectedSite,
  sort,
  staleRobotIds,
  statusesUnavailable,
  totalRobotCount,
}: MonitoringLayoutProps) {
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const mobileListToggleRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const multiSelectActionRef = useRef<HTMLButtonElement>(null);
  const restoreMultiSelectActionFocusRef = useRef(false);
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
      <div className={mobileListOpen ? 'max-md:invisible' : undefined}>
        <SelectedRobotSiteMap
          fleetLocations={fleetLocations}
          onSelectRobot={onSelectRobot}
          robot={selectedRobot}
          site={selectedSite}
        />
      </div>
      <div
        className={[
          'pointer-events-none relative z-10 grid h-full min-h-0 gap-4 overflow-hidden p-4 transition-[grid-template-columns,grid-template-rows] duration-200 motion-reduce:transition-none md:grid-rows-[minmax(0,1fr)]',
          mobileListOpen ? 'grid-rows-[minmax(0,1fr)]' : 'grid-rows-[auto_minmax(0,1fr)]',
          desktopGridColumnsClassName,
        ].join(' ')}
      >
        <div className="pointer-events-auto grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 overflow-visible md:grid-rows-[auto_minmax(0,1fr)]">
          <Select
            className="min-w-0"
            contentClassName="rounded-[var(--design-radius-surface)] p-1.5"
            itemClassName="min-h-10 rounded-md data-[highlighted]:bg-foreground/[0.05]"
            label="사이트"
            leadingIcon="location"
            onValueChange={onSelectSite}
            options={siteOptions}
            showLabel={false}
            triggerClassName={mapOverlayControlClassName
              + ' rounded-lg '
              + mapOverlaySurfaceClassName}
            value={selectedSite.id}
          />

          <Button
            aria-controls="monitoring-robot-list"
            aria-expanded={mobileListOpen}
            className="min-h-12 justify-between md:hidden"
            onClick={() => setMobileListOpen((open) => !open)}
            buttonRef={mobileListToggleRef}
            variant="secondary"
          >
            {mobileListOpen ? '목록 접고 지도 보기' : `로봇 목록 보기 · ${String(monitoredRobots.length)}대`}
            <span className={mobileListOpen ? 'rotate-180' : undefined}><Icon name="chevron-down" /></span>
          </Button>

          <Panel
            aria-label="로봇 선택"
            className={`${mobileListOpen ? 'flex' : 'hidden md:flex'} h-full min-h-0 flex-col overflow-hidden rounded-lg`}
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
            <div className="mb-4 flex items-baseline justify-between gap-2" aria-label="기체 현황">
              <p className="text-base font-semibold tracking-tight">운용 로봇 <span className="tabular-nums">{totalRobotCount}</span></p>
              <span className="text-xs text-muted">
                {statusesUnavailable ? '상태 확인 필요' : `연결 ${String(connectedCount)}대`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Input
                  className="[&>span>span]:left-4 [&>span>span]:text-muted"
                  inputClassName={mapOverlayControlClassName
                    + ' bg-foreground/[0.035] pr-12 pl-10 shadow-none placeholder:text-muted'}
                  inputRef={searchInputRef}
                  label="로봇 검색"
                  leadingIcon="search"
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="이름, ID 또는 기체 번호"
                  role="searchbox"
                  showLabel={false}
                  type="text"
                  value={search}
                />
                {search.length === 0 ? null : (
                  <Button
                    aria-label="로봇 검색어 모두 지우기"
                    className="absolute top-1/2 right-1.5 z-10 size-9 min-h-9 -translate-y-1/2 rounded-full border-0 p-0 text-muted hover:bg-foreground/[0.06] hover:text-foreground active:bg-foreground/[0.1]"
                    onClick={() => {
                      onSearchChange('');
                      searchInputRef.current?.focus();
                    }}
                    variant="ghost"
                  >
                    <Icon name="close" />
                  </Button>
                )}
              </div>
              <Button
                aria-label={isMultiSelectMode ? '선택 취소' : '다중 선택'}
                buttonRef={multiSelectActionRef}
                className="min-w-10 shrink-0 border-0 px-2 text-xs font-medium text-muted hover:text-foreground"
                onClick={isMultiSelectMode
                  ? onCancelMultiSelect
                  : onEnterMultiSelect}
                variant="ghost"
              >
                {isMultiSelectMode ? '취소' : '선택'}
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-1 rounded-md bg-foreground/[0.035] p-1" role="group" aria-label="로봇 상태 필터">
              {([
                { value: 'all', label: '전체' },
                { value: 'attention', label: `확인 필요 ${String(attentionCount)}` },
              ] as const).map((option) => (
                <Button
                  aria-pressed={filter === option.value}
                  className={`min-h-10 flex-1 px-2 text-xs ${filter === option.value ? 'bg-surface text-foreground shadow-sm' : 'text-muted'}`}
                  key={option.value}
                  onClick={() => onFilterChange(option.value)}
                  variant="ghost"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Select
              className="mt-2"
              label="로봇 정렬"
              onValueChange={(value) => onSortChange(value as MonitoringRobotSort)}
              options={[
                { label: '이름순', value: 'name' },
                { label: '확인 필요 우선', value: 'attention' },
                { label: '배터리 낮은 순', value: 'battery' },
              ]}
              showLabel={false}
              triggerClassName="min-h-10 border-0 bg-transparent px-3 text-xs text-muted shadow-none"
              value={sort}
            />
            {statusesUnavailable || staleRobotIds.size > 0 ? (
              <div className="mt-2 rounded-md bg-status-warning-background p-3 text-xs text-status-warning-foreground" role="status">
                <p>{statusesUnavailable ? '로봇 상태를 불러오지 못했습니다.' : `${String(staleRobotIds.size)}대의 상태 수신이 지연되고 있습니다.`}</p>
                <Button className="mt-2 min-h-10 px-2 text-xs" onClick={onRefreshStatuses} variant="secondary">상태 다시 확인</Button>
              </div>
            ) : null}
            {monitoredRobots.length === 0 ? (
              <div className="my-6 text-sm" role="status">
                <p className="font-medium">{filter === 'attention' && search.trim() === '' ? '확인이 필요한 로봇이 없습니다.' : '조건에 맞는 로봇이 없습니다.'}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">검색어나 상태 필터를 바꾸어 확인하세요.</p>
                <Button className="mt-3 min-h-10 text-xs" onClick={() => { onSearchChange(''); onFilterChange('all'); searchInputRef.current?.focus(); }} variant="secondary">전체 로봇 보기</Button>
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
            {isMultiSelectMode ? (
              <div className="mt-2 shrink-0 border-t border-border/70 pt-3">
                <Button
                  {...multiMonitoringMorph.getTriggerProps(multiMonitoringTarget)}
                  aria-label="다중 관제 시작"
                  className="w-full"
                  disabled={
                    selectedMultiRobotIds.length
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
            className={`pointer-events-auto relative ${mobileListOpen ? 'hidden md:flex' : 'flex'} min-h-0 flex-col overflow-hidden rounded-lg max-md:max-h-[45dvh] max-md:self-end md:col-start-3 md:row-start-1`}
            contentClassName="flex min-h-0 flex-1 flex-col"
            layer="translucent"
          >
            <Button
              aria-label="로봇 정보 패널 닫기"
              className="absolute top-3 right-3 z-10 size-10 min-h-10 border-0 bg-transparent p-0 text-muted shadow-none hover:bg-foreground/[0.06] hover:text-foreground active:bg-foreground/[0.1]"
              onClick={onCloseRobotInfo}
              variant="ghost"
            >
              <Icon name="close" />
            </Button>
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
                'mt-4 min-h-12 w-full shrink-0 rounded-md border-0',
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
      <RobotModelViewer nickname={robotNickname ?? robot.displayName} />
      <RobotInfoOverview operationalStatus={operationalStatus} robot={robot} />
    </>
  );
}

function SelectedRobotSiteMap({
  fleetLocations,
  onSelectRobot,
  robot,
  site,
}: {
  readonly fleetLocations: readonly FleetMapLocation[];
  readonly onSelectRobot: (robotId: string) => void;
  readonly robot: RobotDescriptor | undefined;
  readonly site: SiteDescriptor;
}) {
  const geolocation = useRobotGeolocation(
    robot === undefined || site.environment === 'indoor' ? null : robot.id,
  );
  return <SiteMap fleetLocations={fleetLocations} geolocation={geolocation} onSelectRobot={onSelectRobot} robot={robot} site={site} />;
}

export function ControlMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MonitoringRobotFilter>('all');
  const [sort, setSort] = useState<MonitoringRobotSort>('name');
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
    filter,
    robots: robots.robots,
    search,
    sort,
    staleRobotIds,
    statuses,
  }), [filter, robots.robots, search, sort, staleRobotIds, statuses]);
  const selectedRobot = !multiSelectMode
    && robots.status === 'ready'
    && selectedRobotId !== null
    ? robots.robots.find((robot) => robot.id === selectedRobotId)
    : undefined;

  if (robots.status === 'loading') {
    return (
      <div className={monitoringViewportClassName}>
        <h1 className="sr-only">모니터링</h1>
        <QueryFeedback kind="loading" />
      </div>
    );
  }
  if (robots.status === 'error') {
    return (
      <div className={monitoringViewportClassName}>
        <h1 className="sr-only">모니터링</h1>
        <QueryFeedback kind="error" message={robots.message} onRetry={robots.retry} />
      </div>
    );
  }
  if (robots.robots.length === 0 && search.trim().length === 0) {
    return (
      <div className={monitoringViewportClassName}>
        <h1 className="sr-only">모니터링</h1>
        <QueryFeedback kind="empty" message="등록된 로봇이 없습니다." />
      </div>
    );
  }

  const layoutProps = {
    fleetLocations,
    attentionCount: robots.robots.filter((robot) => needsMonitoringAttention(statuses[robot.id], staleRobotIds.has(robot.id))).length,
    connectedCount: robots.robots.filter((robot) => statuses[robot.id]?.data.isConnecting === true && !staleRobotIds.has(robot.id)).length,
    filter,
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
    onFilterChange: setFilter,
    onSortChange: setSort,
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
    robotMonitoringSearch,
    search,
    selectedMultiRobotIds,
    selectedRobot,
    selectedSite,
    sort,
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
