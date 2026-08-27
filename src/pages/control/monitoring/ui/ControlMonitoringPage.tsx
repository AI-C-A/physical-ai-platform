import mapboxgl from 'mapbox-gl';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

import 'mapbox-gl/dist/mapbox-gl.css';

import {
  RobotInfoTable,
  RobotModelViewer,
  useRobotCatalog,
  useRobotOperationalStatus,
  type RobotDescriptor,
  type RobotOperationalStatus,
} from '@/entities/robot';
import {
  isValidRobotGeolocation,
  useRobotGeolocation,
  type RobotGeolocationLoadState,
  type RobotGeolocationObservation,
} from '@/entities/robot-telemetry';
import type { AsyncQueryState } from '@/shared/lib/async-query';
import { appendPathSegment } from '@/shared/lib/navigation';
import { Button } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Input } from '@/shared/ui/input';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';

const monitoringViewportClassName =
  'relative h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden lg:h-dvh';

const PANGYO_STATION_MAP_CENTER = {
  latitude: 37.39472,
  longitude: 127.11153,
} as const;

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
  status,
}: {
  readonly location: RobotMapLocation | null;
  readonly status: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialLocationRef = useRef(location);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? '';
  const styleUrl = import.meta.env.VITE_MAPBOX_STYLE_URL?.trim() ?? '';

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || accessToken === '' || styleUrl === '') return undefined;

    const initialLocation = initialLocationRef.current;
    const initialMapCenter = initialLocation ?? PANGYO_STATION_MAP_CENTER;
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
  }, [accessToken, styleUrl]);

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
      marker = new mapboxgl.Marker({ color: '#2563eb' });
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
              <div className="pointer-events-auto w-full max-w-sm rounded-md bg-white/90 p-3 shadow-lg backdrop-blur-sm">
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
}: {
  readonly geolocation: RobotGeolocationLoadState | null;
  readonly robot: RobotDescriptor | undefined;
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
      status={status}
    />
  );
}

interface MonitoringLayoutProps {
  readonly geolocation: RobotGeolocationLoadState | null;
  readonly monitoredRobots: readonly RobotDescriptor[];
  readonly onSearchChange: (value: string) => void;
  readonly onSelectRobot: (robotId: string) => void;
  readonly operationalStatus: AsyncQueryState<RobotOperationalStatus | null> | null;
  readonly search: string;
  readonly selectedRobot: RobotDescriptor | undefined;
}

function MonitoringLayout({
  geolocation,
  monitoredRobots,
  onSearchChange,
  onSelectRobot,
  operationalStatus,
  search,
  selectedRobot,
}: MonitoringLayoutProps) {
  return (
    <>
      <RobotLocationMap geolocation={geolocation} robot={selectedRobot} />
      <div className="pointer-events-none relative z-10 grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 overflow-hidden p-4 md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)_minmax(15rem,18rem)] md:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(14rem,17rem)_minmax(22rem,1fr)_minmax(15rem,18rem)]">
        <Panel
          className="pointer-events-auto flex min-h-0 flex-col overflow-hidden"
          contentClassName="flex min-h-0 flex-1 flex-col"
          title="로봇 선택"
        >
          <Input
            label="로봇 검색"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="이름 또는 ID"
            type="search"
            value={search}
          />
          {monitoredRobots.length === 0 ? (
            <p className="mt-4" role="status">검색 결과가 없습니다.</p>
          ) : (
            <ul className="mt-4 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
              {monitoredRobots.map((robot) => (
                <li key={robot.id}>
                  <Button
                    aria-pressed={selectedRobot?.id === robot.id}
                    className="w-full justify-between text-left"
                    onClick={() => onSelectRobot(robot.id)}
                    variant={selectedRobot?.id === robot.id ? 'secondary' : 'ghost'}
                  >
                    <span><span className="block">{robot.displayName}</span><span className="block text-xs font-normal">{robot.id}</span></span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          className="pointer-events-auto flex min-h-0 flex-col overflow-hidden md:col-start-3 md:row-start-1"
          contentClassName="min-h-0 overflow-y-auto"
          title="로봇 정보"
        >
          <div className="grid gap-4">
            <RobotModelViewer />
            {selectedRobot === undefined || operationalStatus === null ? (
              <p role="status">표시할 Robot이 없습니다.</p>
            ) : (
              <>
              <RobotInfoTable
                operationalStatus={operationalStatus}
                robot={selectedRobot}
              />
              <Link className="text-sm font-semibold underline" to={appendPathSegment('/control/monitoring', selectedRobot.id)}>
                영상 관제
              </Link>
              </>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function SelectedRobotMonitoringLayout(
  props: Omit<MonitoringLayoutProps, 'geolocation' | 'operationalStatus'> & {
    readonly selectedRobot: RobotDescriptor;
  },
) {
  const operationalStatus = useRobotOperationalStatus(props.selectedRobot.id);
  const geolocation = useRobotGeolocation(props.selectedRobot.id);
  return (
    <MonitoringLayout
      {...props}
      geolocation={geolocation}
      operationalStatus={operationalStatus}
    />
  );
}

export function ControlMonitoringPage() {
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const robots = useRobotCatalog();
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
  const selectedRobot = robots.status === 'ready'
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
    onSearchChange: setSearch,
    onSelectRobot: setSelectedRobotId,
    search,
    selectedRobot,
  };

  return (
    <div className={monitoringViewportClassName}>
      <h1 className="sr-only">모니터링</h1>
      {selectedRobot === undefined ? (
        <MonitoringLayout
          {...layoutProps}
          geolocation={null}
          operationalStatus={null}
        />
      ) : (
        <SelectedRobotMonitoringLayout {...layoutProps} selectedRobot={selectedRobot} />
      )}
    </div>
  );
}
