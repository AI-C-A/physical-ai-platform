import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createInMemoryRobotCatalogWithData,
  RobotCatalogContext,
  RobotOperationalStatusContext,
  type RobotCatalogPort,
  type RobotDescriptor,
  type RobotOperationalStatus,
  type RobotOperationalStatusQueryPort,
} from '@/entities/robot';
import {
  RobotGeolocationContext,
  type RobotGeolocationObservation,
  type RobotGeolocationQueryPort,
} from '@/entities/robot-telemetry';
import { ControlMonitoringPage } from './ControlMonitoringPage';

const {
  addControl,
  addMarkerTo,
  createAttributionControl,
  createMap,
  createMarker,
  easeTo,
  mapInstance,
  setMarkerAttribute,
  setMarkerLngLat,
} = vi.hoisted(() => {
  const addControlMock = vi.fn();
  const easeToMock = vi.fn();
  const removeMock = vi.fn();
  const setMarkerAttributeMock = vi.fn();
  const setMarkerLngLatMock = vi.fn();
  const addMarkerToMock = vi.fn();
  const removeMarkerMock = vi.fn();
  const map = {
    addControl: addControlMock,
    easeTo: easeToMock,
    remove: removeMock,
  };
  const marker = {
    addTo: addMarkerToMock,
    getElement: vi.fn(() => ({ setAttribute: setMarkerAttributeMock })),
    remove: removeMarkerMock,
    setLngLat: setMarkerLngLatMock,
  };
  return {
    addControl: addControlMock,
    addMarkerTo: addMarkerToMock,
    createAttributionControl: vi.fn(function AttributionControl() {
      return {};
    }),
    createMap: vi.fn(function Map(options: unknown) {
      void options;
      return map;
    }),
    createMarker: vi.fn(function Marker() { return marker; }),
    easeTo: easeToMock,
    mapInstance: map,
    setMarkerAttribute: setMarkerAttributeMock,
    setMarkerLngLat: setMarkerLngLatMock,
  };
});

vi.mock('mapbox-gl', () => ({
  default: {
    AttributionControl: createAttributionControl,
    Map: createMap,
    Marker: createMarker,
  },
}));

function createOperationalStatus(
  robotId: string,
  overrides: Partial<RobotOperationalStatus> = {},
): RobotOperationalStatus {
  return {
    robotId,
    integrationProfileId: 'patrol-rest-v1',
    receivedTimestampMs: 1_700_000_000_000,
    data: {
      id: 246,
      serialNumber: 'MOCK00001',
      name: '405',
      nickname: 'Mock Robot',
      description: null,
      battery: 100,
      isConnecting: true,
      latitude: 0,
      longitude: 0,
      isAvailable: null,
      isCharging: false,
      isMovable: true,
      isHeadLightOn: false,
      isCargoOpen: false,
    },
    ...overrides,
  };
}

const operationalStatus: RobotOperationalStatusQueryPort = {
  listOperationalDataSources: () => Promise.resolve([]),
  getOperationalStatus: (robotId) => Promise.resolve(createOperationalStatus(robotId)),
};

function createGeolocation(robotId: string): RobotGeolocationObservation {
  return {
    robotId,
    latitudeDegrees: 10,
    longitudeDegrees: 20,
    horizontalAccuracyMeters: null,
    sourceTimestampMs: null,
    receivedTimestampMs: 1_700_000_000_000,
  };
}

const geolocation: RobotGeolocationQueryPort = {
  getGeolocationObservation: (robotId) => Promise.resolve(createGeolocation(robotId)),
};

function renderPage(
  catalog: RobotCatalogPort = createInMemoryRobotCatalogWithData(),
  status: RobotOperationalStatusQueryPort = operationalStatus,
  location: RobotGeolocationQueryPort = geolocation,
) {
  return render(
    <RobotCatalogContext.Provider value={catalog}>
      <RobotOperationalStatusContext.Provider value={status}>
        <RobotGeolocationContext.Provider value={location}>
          <MemoryRouter>
            <ControlMonitoringPage />
          </MemoryRouter>
        </RobotGeolocationContext.Provider>
      </RobotOperationalStatusContext.Provider>
    </RobotCatalogContext.Provider>,
  );
}

function createRobot(index: number): RobotDescriptor {
  const label = String(index).padStart(2, '0');
  return {
    id: `robot-${String(index).padStart(3, '0')}`,
    serialNumber: `MOCK${String(index).padStart(5, '0')}`,
    displayName: `로봇 ${label}`,
    description: null,
    integrationProfileId: 'patrol-rest-v1',
  };
}

describe('ControlMonitoringPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-mapbox-access-token');
    vi.stubEnv('VITE_MAPBOX_STYLE_URL', 'mapbox://styles/test/style');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Mapbox 토큰 환경변수가 없으면 명확한 설정 오류를 표시한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '');
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '지도를 사용할 수 없습니다.',
    );
    expect(createMap).not.toHaveBeenCalled();
  });

  it('Mapbox 스타일 URL 환경변수가 없으면 명확한 설정 오류를 표시한다', async () => {
    vi.stubEnv('VITE_MAPBOX_STYLE_URL', '');
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '지도를 사용할 수 없습니다.',
    );
    expect(createMap).not.toHaveBeenCalled();
  });

  it('내부 응답 검증 상세를 UI에 표시하지 않는다', async () => {
    renderPage(createInMemoryRobotCatalogWithData(), {
      listOperationalDataSources: () => Promise.resolve([]),
      getOperationalStatus: () => Promise.reject(
        new Error('Robot 운영 상태.data 응답은 객체여야 합니다.'),
      ),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로봇 정보를 불러오지 못했습니다.',
    );
    expect(screen.queryByText(/Robot 운영 상태|\.data|객체여야/u)).not.toBeInTheDocument();
  });

  it('Mapbox 배경 위에 로봇 선택과 Raw 정보 패널만 표시한다', async () => {
    renderPage();

    const pageHeading = await screen.findByRole('heading', {
      level: 1,
      name: '모니터링',
    });
    expect(pageHeading).toHaveClass('sr-only');
    expect(screen.getByRole('heading', { name: '로봇 선택' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '로봇 정보' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '현재 위치 지도' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '운영 요약' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '선택 Robot 운영 상태' }),
    ).not.toBeInTheDocument();

    const map = screen.getByRole('region', { name: '로봇 위치 지도' });
    expect(map).toHaveAttribute('aria-label', '로봇 위치 지도');
    expect(map).toHaveClass('absolute', 'inset-0', 'z-0', 'h-full', 'w-full');
    expect(map.closest('section')).toBeNull();
    await waitFor(() => {
      expect(createMap).toHaveBeenCalledWith(expect.objectContaining({
        accessToken: 'test-mapbox-access-token',
        attributionControl: false,
        language: 'ko',
        logoPosition: 'bottom',
        style: 'mapbox://styles/test/style',
      }));
      expect(addControl).toHaveBeenCalledWith(
        expect.any(Object),
        'bottom-right',
      );
      expect(createAttributionControl).toHaveBeenCalledWith({ compact: true });
    });

    const infoTable = await screen.findByRole('table', {
      name: '수송 로봇 02 로봇 정보',
    });
    const batteryRow = (await within(infoTable).findByText('battery')).closest('tr');
    const availableRow = within(infoTable).getByText('isAvailable').closest('tr');
    const latitudeRow = within(infoTable).getByText('latitude').closest('tr');
    const serialNumberRow = within(infoTable).getByText('serialNumber').closest('tr');
    expect(batteryRow).not.toBeNull();
    expect(availableRow).not.toBeNull();
    expect(latitudeRow).not.toBeNull();
    expect(serialNumberRow).not.toBeNull();
    expect(within(batteryRow as HTMLElement).getByText('100')).toBeInTheDocument();
    expect(within(availableRow as HTMLElement).getByText('null')).toBeInTheDocument();
    expect(within(latitudeRow as HTMLElement).getByText('0')).toBeInTheDocument();
    expect(within(serialNumberRow as HTMLElement).getByText('MOCK00001')).toBeInTheDocument();
    expect(screen.queryByText('연결됨')).not.toBeInTheDocument();
  });

  it('검증된 위치 조회 결과를 선택 로봇 마커와 지도 중심에 반영한다', async () => {
    const latitude = 11;
    const longitude = 21;
    renderPage(
      createInMemoryRobotCatalogWithData(),
      operationalStatus,
      {
        getGeolocationObservation: (robotId) => Promise.resolve({
          ...createGeolocation(robotId),
          latitudeDegrees: latitude,
          longitudeDegrees: longitude,
        }),
      },
    );

    await screen.findByRole('table', { name: '수송 로봇 02 로봇 정보' });
    await waitFor(() => {
      expect(createMarker).toHaveBeenCalledWith({ color: '#2563eb' });
      expect(setMarkerLngLat).toHaveBeenCalledWith([longitude, latitude]);
      expect(addMarkerTo).toHaveBeenCalledWith(mapInstance);
      expect(easeTo).toHaveBeenCalledWith({
        center: [longitude, latitude],
        duration: 600,
      });
    });
    expect(setMarkerAttribute).toHaveBeenCalledWith(
      'aria-label',
      '수송 로봇 02 현재 위치',
    );
  });

  it('위치 조회 결과가 없어도 기본 지도를 띄우고 임의 마커는 만들지 않는다', async () => {
    renderPage(
      createInMemoryRobotCatalogWithData(),
      operationalStatus,
      { getGeolocationObservation: () => Promise.resolve(null) },
    );

    await waitFor(() => {
      expect(createMap).toHaveBeenCalledWith(expect.objectContaining({
        accessToken: 'test-mapbox-access-token',
        style: 'mapbox://styles/test/style',
      }));
    });
    const mapOptions = createMap.mock.calls[0]?.[0];
    expect(mapOptions).toEqual(expect.objectContaining({
      center: [127.11153, 37.39472],
      zoom: 15.5,
    }));
    expect(createMarker).not.toHaveBeenCalled();
    expect(screen.queryByText('위치 데이터가 없습니다.')).not.toBeInTheDocument();
  });

  it('선택한 로봇이 바뀌면 해당 로봇의 상세 정보를 갱신한다', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('table', { name: '수송 로봇 02 로봇 정보' });
    await waitFor(() => expect(createMap).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: /정찰 로봇 01/u }));

    const selected = screen.getByRole('heading', { name: '로봇 정보' }).closest('section');
    expect(selected).not.toBeNull();
    expect(await screen.findByRole('table', {
      name: '정찰 로봇 01 로봇 정보',
    })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영상 관제' })).toHaveAttribute(
      'href',
      '/control/monitoring/robot-001',
    );
    expect(createMap).toHaveBeenCalledOnce();
  });

  it('검색 결과에서 벗어난 선택을 남기지 않고 첫 결과로 전환한다', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));
    await user.type(screen.getByRole('searchbox', { name: '로봇 검색' }), '정찰 로봇 01');

    const selected = screen.getByRole('heading', { name: '로봇 정보' }).closest('section');
    expect(selected).not.toBeNull();
    expect(await within(selected as HTMLElement).findByRole('table', {
      name: '정찰 로봇 01 로봇 정보',
    })).toBeInTheDocument();
    expect(within(selected as HTMLElement).queryByRole('table', {
      name: '수송 로봇 02 로봇 정보',
    })).not.toBeInTheDocument();
  });

  it('보조 통계와 페이지네이션 없이 전체 로봇을 표시하고 검색한다', async () => {
    const user = userEvent.setup();
    const allRobots = Array.from({ length: 25 }, (_, index) => createRobot(index + 1));
    const listRobots = vi.fn<RobotCatalogPort['listRobots']>(() => Promise.resolve(allRobots));
    const queryRobots = vi.fn<RobotCatalogPort['queryRobots']>();
    const catalog: RobotCatalogPort = {
      getRobot: (robotId) => Promise.resolve(
        allRobots.find((robot) => robot.id === robotId) ?? null,
      ),
      listRobots,
      queryRobots,
    };
    renderPage(catalog);

    expect(await screen.findByRole('table', {
      name: '로봇 01 로봇 정보',
    })).toBeInTheDocument();
    expect(listRobots).toHaveBeenCalledOnce();
    expect(queryRobots).not.toHaveBeenCalled();
    expect(screen.queryByRole('navigation', { name: '페이지 이동' })).not.toBeInTheDocument();
    expect(screen.queryByText(/검색 결과 \d+대/u)).not.toBeInTheDocument();

    const robotSelection = screen.getByRole('heading', { name: '로봇 선택' }).closest('section');
    expect(robotSelection).not.toBeNull();
    expect(within(robotSelection as HTMLElement).getAllByRole('button')).toHaveLength(25);

    await user.type(screen.getByRole('searchbox', { name: '로봇 검색' }), '로봇 25');
    expect(await screen.findByRole('table', {
      name: '로봇 25 로봇 정보',
    })).toBeInTheDocument();
    expect(screen.queryByText(/검색 결과 \d+대/u)).not.toBeInTheDocument();
  });
});
