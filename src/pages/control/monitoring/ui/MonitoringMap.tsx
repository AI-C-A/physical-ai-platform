import mapboxgl from 'mapbox-gl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { RobotDescriptor } from '@/entities/robot';
import { IndoorSiteMap, type OutdoorSiteDescriptor, type SiteDescriptor } from '@/entities/site';
import type { RobotGeolocationLoadState } from '@/entities/robot-telemetry';
import { useMapStylePreference } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Icon } from '@/shared/ui/icon';
import { QueryFeedback } from '@/shared/ui/query-feedback';

import 'mapbox-gl/dist/mapbox-gl.css';
import './control-monitoring.css';
import { getRobotMapLocation, type FleetMapLocation, type RobotMapLocation } from '../model/monitoring-map-locations';

export const mapOverlaySurfaceClassName =
  'border-0 bg-surface-muted/[0.88] shadow-xl backdrop-blur-xl';

function MonitoringMap({
  fleetLocations,
  location,
  onSelectRobot,
  selectedRobotId,
  site,
  status,
}: {
  readonly fleetLocations: readonly FleetMapLocation[];
  readonly location: RobotMapLocation | null;
  readonly onSelectRobot: (robotId: string) => void;
  readonly selectedRobotId: string | undefined;
  readonly site: OutdoorSiteDescriptor;
  readonly status: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialLocationRef = useRef(location);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const fleetMarkersRef = useRef(new Map<string, { readonly marker: mapboxgl.Marker; readonly button: HTMLButtonElement }>());
  const [followRobot, setFollowRobot] = useState(true);
  const [mapError, setMapError] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
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
    let disposed = false;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        accessToken,
        attributionControl: false,
        ...cameraOptions,
        container,
        language: 'ko',
        logoPosition: 'bottom',
        performanceMetricsCollection: false,
        style: styleUrl,
      });
    } catch {
      queueMicrotask(() => { if (!disposed) setMapError(true); });
      return () => { disposed = true; };
    }
    mapRef.current = map;
    const fleetMarkers = fleetMarkersRef.current;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    const onMapError = () => { if (!map.isStyleLoaded()) setMapError(true); };
    const onMapReady = () => setMapError(false);
    const onMapDrag = () => setFollowRobot(false);
    map.on('error', onMapError);
    map.on('load', onMapReady);
    map.on('dragstart', onMapDrag);
    const loadDeadline = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setMapError(true);
    }, 15_000);

    return () => {
      disposed = true;
      window.clearTimeout(loadDeadline);
      map.off('error', onMapError);
      map.off('load', onMapReady);
      map.off('dragstart', onMapDrag);
      markerRef.current?.remove();
      fleetMarkers.forEach(({ marker }) => marker.remove());
      fleetMarkers.clear();
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [accessToken, mapAttempt, mapCenterLatitude, mapCenterLongitude, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    if (location === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const coordinates: [number, number] = [location.longitude, location.latitude];
    const hasFleetMarker = fleetLocations.some((robot) => robot.robotId === selectedRobotId);
    if (hasFleetMarker) {
      markerRef.current?.remove();
      markerRef.current = null;
    } else {
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
    }
    if (followRobot) map.easeTo({ center: coordinates, duration: 600 });
  }, [accessToken, fleetLocations, followRobot, location, mapAttempt, selectedRobotId, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const markers = fleetMarkersRef.current;
    const visibleIds = new Set(fleetLocations.map((robot) => robot.robotId));
    for (const [robotId, { marker }] of markers) {
      if (visibleIds.has(robotId)) continue;
      marker.remove();
      markers.delete(robotId);
    }
    fleetLocations.forEach((robot, index) => {
      let entry = markers.get(robot.robotId);
      if (entry === undefined) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'monitoring-map-marker';
        const marker = new mapboxgl.Marker({ element: button, anchor: 'center' });
        marker.setLngLat([robot.longitude, robot.latitude]);
        marker.addTo(map);
        entry = { marker, button };
        markers.set(robot.robotId, entry);
      }
      const { marker, button } = entry;
      const isSelected = robot.robotId === selectedRobotId;
      button.dataset.attention = String(robot.needsAttention);
      button.dataset.selected = String(isSelected);
      button.textContent = robot.label.match(/\d+$/u)?.[0] ?? String(index + 1);
      button.title = robot.label;
      button.setAttribute('aria-label', `${robot.label} 위치 선택`);
      button.setAttribute('aria-pressed', String(isSelected));
      button.onclick = () => onSelectRobot(robot.robotId);
      const coordinates = isSelected && location !== null ? location : robot;
      marker.setLngLat([coordinates.longitude, coordinates.latitude]);
    });
  }, [accessToken, fleetLocations, location, mapAttempt, onSelectRobot, selectedRobotId, styleUrl]);

  const resetMap = () => {
    setFollowRobot(false);
    mapRef.current?.easeTo({
      bearing: 347.2,
      center: [mapCenterLongitude, mapCenterLatitude],
      duration: 600,
      pitch: 55,
      zoom: 15.5,
    });
  };

  const showFleet = () => {
    if (fleetLocations.length === 0) return;
    setFollowRobot(false);
    const longitude = fleetLocations.map((robot) => robot.longitude);
    const latitude = fleetLocations.map((robot) => robot.latitude);
    const wide = (containerRef.current?.clientWidth ?? 0) >= 768;
    mapRef.current?.fitBounds([
      [Math.min(...longitude), Math.min(...latitude)],
      [Math.max(...longitude), Math.max(...latitude)],
    ], {
      duration: 600,
      maxZoom: 18,
      padding: wide ? { top: 120, bottom: 100, left: 320, right: selectedRobotId === undefined ? 80 : 380 }
        : { top: 180, bottom: selectedRobotId === undefined ? 80 : window.innerHeight * 0.45 + 24, left: 48, right: 48 },
    });
  };

  return (
    <div
      aria-label="로봇 위치 지도"
      className="absolute inset-0 z-0 h-full w-full"
      role="region"
    >
      {accessToken !== '' && styleUrl !== '' ? (
        <>
          <div className="h-full w-full" ref={containerRef} />
          {!mapError ? (
            <div className={`absolute inset-x-0 z-10 flex justify-center px-4 ${location === null ? 'bottom-8' : 'bottom-[calc(45dvh+1.5rem)]'} md:top-4 md:bottom-auto`}>
              <div className={`flex items-center gap-1 rounded-[var(--design-radius-control)] p-1 ${mapOverlaySurfaceClassName}`} role="group" aria-label="지도 보기 제어">
                <Button className="min-h-10 px-3 text-xs" onClick={resetMap} variant="ghost">
                  <Icon name="map" />사이트 중심
                </Button>
                {fleetLocations.length > 0 ? (
                  <Button className="min-h-10 px-3 text-xs" onClick={showFleet} variant="ghost">전체 위치</Button>
                ) : null}
                {location === null ? null : (
                  <Button
                    aria-pressed={followRobot}
                    className={`min-h-10 px-3 text-xs ${followRobot ? 'bg-surface text-foreground' : 'text-muted'}`}
                    onClick={() => setFollowRobot((current) => !current)}
                    variant="ghost"
                  >
                    <Icon name="location" />위치 따라가기
                  </Button>
                )}
              </div>
            </div>
          ) : null}
          {status === null ? null : (
            <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4">
              <div className={'pointer-events-auto w-full max-w-sm rounded-[var(--design-radius-surface)] p-3 '
                + mapOverlaySurfaceClassName}>
                {status}
              </div>
            </div>
          )}
        </>
      ) : null}
      {accessToken === '' || styleUrl === '' || mapError ? (
        <div className="absolute inset-0 grid place-items-center bg-layer-canvas px-6 py-24">
          <div className="max-w-xs text-center md:ml-64">
            <div className="mb-4 flex justify-center text-muted"><Icon name="map" size="md" /></div>
            <ErrorMessage className="border-0 bg-transparent p-0 text-base text-foreground">지도를 사용할 수 없습니다.</ErrorMessage>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {mapError ? '지도 연결을 확인한 뒤 다시 불러와 주세요.' : '지도 연결 설정을 확인해 주세요.'} 로봇 정보와 영상 관제는 계속 사용할 수 있습니다.
            </p>
            {mapError ? (
              <Button className="mt-4" onClick={() => { setMapError(false); setMapAttempt((attempt) => attempt + 1); }} variant="secondary">
                <Icon name="restart" />지도 다시 불러오기
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RobotLocationMap({
  fleetLocations,
  geolocation,
  robot,
  onSelectRobot,
  site,
}: {
  readonly fleetLocations: readonly FleetMapLocation[];
  readonly geolocation: RobotGeolocationLoadState | null;
  readonly robot: RobotDescriptor | undefined;
  readonly onSelectRobot: (robotId: string) => void;
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
      fleetLocations={fleetLocations}
      location={location}
      onSelectRobot={onSelectRobot}
      selectedRobotId={robot?.id}
      site={site}
      status={status}
    />
  );
}

export function SiteMap({
  fleetLocations,
  geolocation,
  robot,
  onSelectRobot,
  site,
}: {
  readonly fleetLocations: readonly FleetMapLocation[];
  readonly geolocation: RobotGeolocationLoadState | null;
  readonly robot: RobotDescriptor | undefined;
  readonly onSelectRobot: (robotId: string) => void;
  readonly site: SiteDescriptor;
}) {
  if (site.environment === 'indoor') {
    return <IndoorSiteMap site={site} />;
  }

  return (
    <RobotLocationMap
      key={site.id}
      fleetLocations={fleetLocations}
      geolocation={geolocation}
      robot={robot}
      onSelectRobot={onSelectRobot}
      site={site}
    />
  );
}
