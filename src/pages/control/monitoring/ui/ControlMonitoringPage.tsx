import mapboxgl from 'mapbox-gl';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import 'mapbox-gl/dist/mapbox-gl.css';

import {
  RobotInfoOverview,
  RobotModelViewer,
  useRobotCatalog,
  useRobotOperationalStatus,
  useRobotOperationalStatuses,
  type RobotDescriptor,
  type RobotOperationalStatus,
} from '@/entities/robot';
import {
  IndoorSiteMap,
  monitoringSites,
  type OutdoorSiteDescriptor,
  type SiteDescriptor,
} from '@/entities/site';
import {
  isValidRobotGeolocation,
  useRobotGeolocation,
  type RobotGeolocationLoadState,
  type RobotGeolocationObservation,
} from '@/entities/robot-telemetry';
import { useMapStylePreference } from '@/shared/config';
import { appendPathSegment } from '@/shared/lib/navigation';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Select } from '@/shared/ui/select';

const monitoringViewportClassName =
  'relative h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden lg:h-dvh';
const mapOverlaySurfaceClassName =
  'border-0 bg-surface-muted/[0.88] shadow-xl backdrop-blur-xl';
const mapOverlayControlClassName =
  'min-h-12 rounded-md border-0 px-4 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus/10 focus-visible:ring-inset';
const siteIdSearchParameter = 'siteId';

const siteOptions = monitoringSites.map((site) => ({
  label: site.displayName,
  value: site.id,
}));

function getRobotSubtitle(robot: RobotDescriptor): string {
  const serialNumber = robot.serialNumber ?? '—';
  if (robot.name === null || robot.name === robot.displayName) return serialNumber;
  return `${serialNumber} · ${robot.name}`;
}

interface RobotMapLocation {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
}

function getRobotMapLocation(
  robot: RobotDescriptor | undefined,
  geolocation: RobotGeolocationObservation | null,
): RobotMapLocation | null {
  if (
    robot === undefined
    || geolocation === null
    || geolocation.robotId !== robot.id
    || !isValidRobotGeolocation(geolocation)
  ) return null;

  return {
    label: robot.displayName,
    latitude: geolocation.latitudeDegrees,
    longitude: geolocation.longitudeDegrees,
  };
}

function MonitoringMap({
  location,
  site,
  status,
}: {
  readonly location: RobotMapLocation | null;
  readonly site: OutdoorSiteDescriptor;
  readonly status: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialLocationRef = useRef(location);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markerRef = useRef<mapboxgl.Marker | null>(null);
    const { selectedStyle } = useMapStylePreference();
    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? '';
    const styleUrl = selectedStyle.styleUrl;
  const mapCenterLatitude = site.mapCenter.latitude;
  const mapCenterLongitude = site.mapCenter.longitude;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || accessToken === '' || styleUrl === '') return undefined;

    const initialLocation = initialLocationRef.current;
    const initialMapCenter = initialLocation ?? {
      latitude: mapCenterLatitude,
      longitude: mapCenterLongitude,
    };
    const cameraOptions = {
      bearing: 347.2,
      center: [
        initialMapCenter.longitude,
        initialMapCenter.latitude,
      ] as [number, number],
      pitch: 55,
      zoom: 15.5,
    };
    const map = new mapboxgl.Map({
      accessToken,
      attributionControl: false,
      ...cameraOptions,
      container,
      language: 'ko',
      logoPosition: 'bottom',
      performanceMetricsCollection: false,
      style: styleUrl,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [accessToken, mapCenterLatitude, mapCenterLongitude, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    if (location === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const coordinates: [number, number] = [location.longitude, location.latitude];
    let marker = markerRef.current;
    if (marker === null) {
      marker = new mapboxgl.Marker({ color: 'var(--action-primary)' });
      markerRef.current = marker;
      marker.setLngLat(coordinates);
      marker.addTo(map);
    } else {
      marker.setLngLat(coordinates);
    }

    const markerElement = marker.getElement();
    markerElement.setAttribute('aria-label', `${location.label} 현재 위치`);
    markerElement.setAttribute('role', 'img');
    markerElement.setAttribute('title', `${location.label} 현재 위치`);
    map.easeTo({ center: coordinates, duration: 600 });
  }, [accessToken, location, styleUrl]);

  return (
    <div
      aria-label="로봇 위치 지도"
      className="absolute inset-0 z-0 h-full w-full"
      role="region"
    >
      {accessToken === '' ? (
        <ErrorMessage className="m-4 p-3">
          지도를 사용할 수 없습니다.
        </ErrorMessage>
      ) : styleUrl === '' ? (
        <ErrorMessage className="m-4 p-3">
          지도를 사용할 수 없습니다.
        </ErrorMessage>
      ) : (
        <>
          <div className="h-full w-full" ref={containerRef} />
          {status === null ? null : (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
              <div className={'pointer-events-auto w-full max-w-sm rounded-lg p-3 '
                + mapOverlaySurfaceClassName}>
                {status}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RobotLocationMap({
  geolocation,
  robot,
  site,
}: {
  readonly geolocation: RobotGeolocationLoadState | null;
  readonly robot: RobotDescriptor | undefined;
  readonly site: OutdoorSiteDescriptor;
}) {
  let location: RobotMapLocation | null = null;
  let status: ReactNode = null;

  if (robot !== undefined && geolocation !== null) {
    if (geolocation.status === 'loading') {
      status = <QueryFeedback kind="loading" />;
    } else if (geolocation.status === 'error') {
      status = (
        <QueryFeedback
          kind="error"
          message="로봇 위치를 불러오지 못했습니다."
          onRetry={geolocation.retry}
        />
      );
    } else {
      location = getRobotMapLocation(robot, geolocation.data);
    }
  }

  return (
    <MonitoringMap
      location={location}
      site={site}
      status={status}
    />
  );
}

function SiteMap({
  geolocation,
  robot,
  site,
}: {
  readonly geolocation: RobotGeolocationLoadState | null;
  readonly robot: RobotDescriptor | undefined;
  readonly site: SiteDescriptor;
}) {
  if (site.environment === 'indoor') {
    return <IndoorSiteMap site={site} />;
  }

  return (
    <RobotLocationMap
      geolocation={geolocation}
      robot={robot}
      site={site}
    />
  );
}

interface MonitoringLayoutProps {
  readonly monitoredRobots: readonly RobotDescriptor[];
  readonly onCloseRobotInfo: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onSelectRobot: (robotId: string) => void;
  readonly onSelectSite: (siteId: string) => void;
  readonly operationalStatuses: Readonly<Record<string, RobotOperationalStatus | null>>;
  readonly robotMonitoringSearch: string;
  readonly search: string;
  readonly selectedRobot: RobotDescriptor | undefined;
  readonly selectedSite: SiteDescriptor;
}

function MonitoringLayout({
  monitoredRobots,
  onCloseRobotInfo,
  onSearchChange,
  onSelectRobot,
  onSelectSite,
  operationalStatuses,
  robotMonitoringSearch,
  search,
  selectedRobot,
  selectedSite,
}: MonitoringLayoutProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileGridRowsClassName = selectedRobot === undefined
    ? 'grid-rows-[minmax(0,1fr)_auto]'
    : 'grid-rows-[minmax(0,1fr)_minmax(0,1fr)]';
  const desktopGridColumnsClassName = selectedRobot === undefined
    ? 'md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)_0rem] xl:grid-cols-[minmax(14rem,17rem)_minmax(22rem,1fr)_0rem]'
    : 'md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)_minmax(17rem,20rem)] xl:grid-cols-[minmax(14rem,17rem)_minmax(22rem,1fr)_minmax(20rem,23rem)]';

  return (
    <>
      <SelectedRobotSiteMap
        robot={selectedRobot}
        site={selectedSite}
      />
      <div
        className={[
          'pointer-events-none relative z-10 grid h-full min-h-0 gap-4 overflow-hidden p-4 transition-[grid-template-columns,grid-template-rows] duration-200 motion-reduce:transition-none md:grid-rows-[minmax(0,1fr)]',
          mobileGridRowsClassName,
          desktopGridColumnsClassName,
        ].join(' ')}
      >
        <div className="pointer-events-auto grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-visible">
          <Select
            className="min-w-0"
            contentClassName="rounded-lg border-0 bg-surface-muted/[0.97] p-1.5 shadow-xl backdrop-blur-xl"
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

          <Panel
            aria-label="로봇 선택"
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg"
            contentClassName="flex min-h-0 flex-1 flex-col"
            layer="translucent"
          >
            <div className="relative">
              <Input
                className="[&>span>span]:left-4 [&>span>span]:text-muted"
                inputClassName={mapOverlayControlClassName
                  + ' bg-foreground/[0.035] pr-12 pl-10 shadow-none placeholder:text-muted'}
                inputRef={searchInputRef}
                label="로봇 검색"
                leadingIcon="search"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="이름 또는 ID"
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
            {monitoredRobots.length === 0 ? (
              <p className="mt-4" role="status">검색 결과가 없습니다.</p>
            ) : (
              <ul className="mt-4 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
                {monitoredRobots.map((robot) => {
                  const isDisconnected = operationalStatuses[robot.id]
                    ?.data.isConnecting === false;
                  const isSelected = selectedRobot?.id === robot.id;
                  return (
                    <li key={robot.id}>
                      <Button
                        aria-pressed={isSelected}
                        className={[
                          'w-full justify-between rounded-md border-0 text-left',
                          isSelected
                            ? 'bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.08] active:bg-foreground/[0.1]'
                            : 'bg-transparent hover:bg-foreground/[0.035] active:bg-foreground/[0.05]',
                          isDisconnected ? 'opacity-50' : undefined,
                        ].filter(Boolean).join(' ')}
                        onClick={() => onSelectRobot(robot.id)}
                        variant="ghost"
                      >
                        <span>
                          <span className="block">{robot.displayName}</span>
                          <span className="block text-xs font-normal">
                            {getRobotSubtitle(robot)}
                          </span>
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {selectedRobot === undefined ? null : (
          <Panel
            aria-label={`${selectedRobot.displayName} 로봇 패널`}
            className="pointer-events-auto relative flex min-h-0 flex-col overflow-hidden rounded-lg md:col-start-3 md:row-start-1"
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
                <SelectedRobotInfo robot={selectedRobot} />
              </div>
            </div>
            <Link
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

function SelectedRobotInfo({ robot }: { readonly robot: RobotDescriptor }) {
  const operationalStatus = useRobotOperationalStatus(robot.id);
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
  robot,
  site,
}: {
  readonly robot: RobotDescriptor | undefined;
  readonly site: SiteDescriptor;
}) {
  const geolocation = useRobotGeolocation(
    robot === undefined || site.environment === 'indoor' ? null : robot.id,
  );
  return <SiteMap geolocation={geolocation} robot={robot} site={site} />;
}

export function ControlMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const robots = useRobotCatalog();
  const robotIds = useMemo(() => robots.robots.map((robot) => robot.id), [robots.robots]);
  const operationalStatuses = useRobotOperationalStatuses(robotIds);
  const requestedSiteId = searchParams.get(siteIdSearchParameter);
  const selectedSite = monitoringSites.find((site) => site.id === requestedSiteId)
    ?? monitoringSites[0];
  const robotMonitoringSearchParams = new URLSearchParams(searchParams);
  robotMonitoringSearchParams.set(siteIdSearchParameter, selectedSite.id);
  const robotMonitoringSearch = `?${robotMonitoringSearchParams.toString()}`;

  useEffect(() => {
    if (requestedSiteId === selectedSite.id) return;

    setSearchParams((currentSearchParams) => {
      const nextSearchParams = new URLSearchParams(currentSearchParams);
      nextSearchParams.set(siteIdSearchParameter, selectedSite.id);
      return nextSearchParams;
    }, { replace: true });
  }, [requestedSiteId, selectedSite.id, setSearchParams]);

  const monitoredRobots = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return robots.robots
      .filter((robot) =>
        robot.displayName.toLocaleLowerCase().includes(normalizedSearch)
        || robot.id.toLocaleLowerCase().includes(normalizedSearch))
      .sort((left, right) => {
        const primary = left.displayName.localeCompare(right.displayName, 'ko');
        return primary === 0 ? left.id.localeCompare(right.id) : primary;
      });
  }, [robots.robots, search]);
  const selectedRobot = robots.status === 'ready' && selectedRobotId !== null
    ? monitoredRobots.find((robot) => robot.id === selectedRobotId)
      ?? monitoredRobots[0]
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
    monitoredRobots,
    onCloseRobotInfo: () => setSelectedRobotId(null),
    onSearchChange: setSearch,
    onSelectRobot: setSelectedRobotId,
    onSelectSite: (siteId: string) => {
      if (!monitoringSites.some((site) => site.id === siteId)) return;

      setSearchParams((currentSearchParams) => {
        const nextSearchParams = new URLSearchParams(currentSearchParams);
        nextSearchParams.set(siteIdSearchParameter, siteId);
        return nextSearchParams;
      });
    },
    operationalStatuses: operationalStatuses.status === 'ready'
      ? operationalStatuses.data
      : {},
    robotMonitoringSearch,
    search,
    selectedRobot,
    selectedSite,
  };

  return (
    <div className={monitoringViewportClassName}>
      <h1 className="sr-only">모니터링</h1>
      <MonitoringLayout {...layoutProps} />
    </div>
  );
}
