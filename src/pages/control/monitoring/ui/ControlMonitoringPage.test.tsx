import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterAll(() => {
  if (scrollIntoViewDescriptor === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    return;
  }
  Object.defineProperty(
    HTMLElement.prototype,
    'scrollIntoView',
    scrollIntoViewDescriptor,
  );
});

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
      battery: 100,
      isConnecting: true,
      latitude: 0,
      longitude: 0,
      isAvailable: null,
      isCharging: false,
      isMovable: true,
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
  initialEntry = '/control/monitoring',
) {
  return render(
    <RobotCatalogContext.Provider value={catalog}>
      <RobotOperationalStatusContext.Provider value={status}>
        <RobotGeolocationContext.Provider value={location}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <ControlMonitoringPage />
            <CurrentLocation />
          </MemoryRouter>
        </RobotGeolocationContext.Provider>
      </RobotOperationalStatusContext.Provider>
    </RobotCatalogContext.Provider>,
  );
}

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="current-location" hidden>
      {`${location.pathname}${location.search}`}
    </output>
  );
}

function createRobot(index: number): RobotDescriptor {
  const label = String(index).padStart(2, '0');
  return {
    id: `robot-${String(index).padStart(3, '0')}`,
    serialNumber: `MOCK${String(index).padStart(5, '0')}`,
    name: `API name ${label}`,
    displayName: `로봇 ${label}`,
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it('3D 뷰어 기본 로딩 표시 대신 공용 스피너를 표시한다', async () => {
    vi.stubGlobal('WebGLRenderingContext', class {});
    vi.spyOn(customElements, 'get').mockReturnValue(class extends HTMLElement {});
    renderPage();

    const modelViewerContainer = await screen.findByRole('group', {
      name: '로봇 3D 모델',
    });
    const spinner = within(modelViewerContainer).getByRole('status', {
      name: '3D 모델 불러오는 중',
    });
    const modelViewer = modelViewerContainer.querySelector('model-viewer');
    if (modelViewer === null) throw new Error('3D 모델 뷰어를 찾을 수 없습니다.');

    fireEvent.load(modelViewer);

    await waitFor(() => expect(spinner).not.toBeInTheDocument());
  });

  it('기본 실외 사이트의 Mapbox 배경 위에 로봇 선택과 Raw 정보 패널을 표시한다', async () => {
    renderPage();

    const pageHeading = await screen.findByRole('heading', {
      level: 1,
      name: '모니터링',
    });
    expect(pageHeading).toHaveClass('sr-only');
    expect(screen.getByRole('heading', { name: '로봇 선택' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '사이트' })).toHaveTextContent(
      '판교',
    );
    expect(screen.getByRole('combobox', { name: '사이트' })).not.toHaveTextContent('· 실외');
    expect(await screen.findByRole('heading', { name: '수송 로봇 02' })).toBeInTheDocument();
    const robotSelection = screen.getByRole('heading', { name: '로봇 선택' }).closest('section');
    expect(robotSelection).not.toBeNull();
    const fallbackNameButton = within(robotSelection as HTMLElement).getByRole('button', {
      name: /수송 로봇 02/u,
    });
    expect(within(fallbackNameButton).getByText('N0000002')).toBeInTheDocument();
    expect(within(fallbackNameButton).queryByText('N0000002 · 수송 로봇 02'))
      .not.toBeInTheDocument();
    const modelViewer = screen.getByRole('group', { name: '로봇 3D 모델' });
    const modelViewerElement = modelViewer.querySelector('model-viewer');
    expect(modelViewerElement).toHaveAttribute('src', '/assets/go2_walk.glb');
    expect(modelViewerElement).toHaveAttribute(
      'interaction-prompt',
      'none',
    );
    expect(
      modelViewerElement?.querySelector('[slot="progress-bar"]'),
    ).toBeInTheDocument();
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
    await waitFor(() => {
      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/control/monitoring?siteId=pangyo-outdoor-zone',
      );
    });
  });

  it('URL의 사이트 ID로 선택 상태와 지도를 복원한다', async () => {
    vi.stubGlobal('WebGLRenderingContext', class {});
    vi.spyOn(customElements, 'get').mockReturnValue(class extends HTMLElement {});
    renderPage(
      createInMemoryRobotCatalogWithData(),
      operationalStatus,
      geolocation,
      '/control/monitoring?view=compact&siteId=pangyo-army-ax-hub',
    );

    expect(await screen.findByRole('combobox', { name: '사이트' })).toHaveTextContent(
      '판교 육군 AX 거점',
    );
    expect(screen.getByRole('combobox', { name: '사이트' })).not.toHaveTextContent('· 실내');
    expect(await screen.findByRole('region', {
      name: '판교 육군 AX 거점 실내 지도',
    })).toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/monitoring?view=compact&siteId=pangyo-army-ax-hub',
    );
  });

  it('실내 사이트를 선택하면 Mapbox 대신 해당 사이트 GLB 지도를 표시한다', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('WebGLRenderingContext', class {});
    vi.spyOn(customElements, 'get').mockReturnValue(class extends HTMLElement {});
    renderPage();

    await waitFor(() => expect(createMap).toHaveBeenCalledOnce());
    const siteSelect = screen.getByRole('combobox', { name: '사이트' });
    siteSelect.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', {
      name: '판교 육군 AX 거점',
    });
    await user.keyboard('{ArrowDown}{Enter}');

    const indoorMap = await screen.findByRole('region', {
      name: '판교 육군 AX 거점 실내 지도',
    });
    expect(screen.getByRole('combobox', { name: '사이트' })).toHaveTextContent(
      '판교 육군 AX 거점',
    );
    expect(screen.getByRole('combobox', { name: '사이트' })).not.toHaveTextContent('· 실내');
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    );
    expect(screen.getByRole('link', { name: '영상 관제' })).toHaveAttribute(
      'href',
      '/control/monitoring/robot-002?siteId=pangyo-army-ax-hub',
    );
    const indoorModelViewer = indoorMap.querySelector('model-viewer');
    expect(indoorModelViewer).toHaveAttribute('src', '/assets/sites/pangyo-v1.glb');
    expect(indoorModelViewer).toHaveAttribute('camera-orbit', '-15deg 50deg 145%');
    expect(indoorModelViewer).toHaveAttribute('disable-tap');
    expect(indoorModelViewer).toHaveAttribute('field-of-view', '40deg');
    expect(indoorModelViewer).toHaveAttribute('environment-image', 'legacy');
    expect(indoorModelViewer).toHaveAttribute('exposure', '0.5');
    expect(indoorModelViewer).toHaveAttribute('interpolation-decay', '0');
    expect(indoorModelViewer).toHaveAttribute('max-camera-orbit', 'auto auto 180%');
    expect(indoorModelViewer).toHaveAttribute('min-camera-orbit', 'auto auto 20%');
    expect(indoorModelViewer).toHaveAttribute('shadow-intensity', '0.3');
    expect(indoorModelViewer).toHaveAttribute('shadow-softness', '0.85');
    expect(indoorModelViewer).toHaveAttribute('tone-mapping', 'neutral');
    expect(indoorModelViewer?.querySelector('[slot="pan-target"]'))
      .toHaveClass('hidden');

    const receivedButtons: number[] = [];
    indoorModelViewer?.addEventListener('pointerdown', (event) => {
      receivedButtons.push(event.button);
    });
    const leftPointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
    });
    Object.defineProperty(leftPointerDown, 'pointerType', { value: 'mouse' });
    const rightPointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 2,
    });
    Object.defineProperty(rightPointerDown, 'pointerType', { value: 'mouse' });
    indoorModelViewer?.dispatchEvent(leftPointerDown);
    indoorModelViewer?.dispatchEvent(rightPointerDown);
    expect(receivedButtons).toEqual([2, 0]);
    let pointerUpAltKey = false;
    indoorModelViewer?.addEventListener('pointerup', (event) => {
      pointerUpAltKey = event.altKey;
    });
    const pointerUp = new MouseEvent('pointerup', { bubbles: true });
    Object.defineProperty(pointerUp, 'pointerType', { value: 'mouse' });
    indoorModelViewer?.dispatchEvent(pointerUp);
    expect(pointerUpAltKey).toBe(true);

    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.assign(indoorModelViewer as HTMLElement, {
      cameraOrbit: '',
      cameraTarget: '',
      getBoundingClientRect: vi.fn(() => ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
      })),
      getCameraOrbit: vi.fn(() => ({
        phi: Math.PI / 4,
        radius: 100,
        theta: 0,
      })),
      getCameraTarget: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
      getFieldOfView: vi.fn(() => 40),
      jumpCameraToGoal: vi.fn(),
      positionAndNormalFromPoint: vi.fn(() => ({
        normal: { x: 0, y: 1, z: 0 },
        position: { x: 10, y: 0, z: 20 },
      })),
      updateComplete: Promise.resolve(),
    });
    const wheelEventAllowed = fireEvent.wheel(indoorModelViewer as HTMLElement, {
      clientX: 75,
      clientY: 50,
      deltaY: -100,
    });
    expect(wheelEventAllowed).toBe(false);
    expect((indoorModelViewer as HTMLElement & { cameraOrbit: string }).cameraOrbit)
      .toBe('');
    const expectedRadius = 100 * Math.exp(-100 * 0.0015);
    animationFrames.shift()?.(performance.now() + 220);
    const expectedScaleRatio = expectedRadius / 100;
    expect((indoorModelViewer as HTMLElement & { cameraOrbit: string }).cameraOrbit)
      .toBe(`0rad ${Math.PI / 4}rad ${expectedRadius}m`);
    const mapPlaneAnchorX = 50 * Math.tan(40 * Math.PI / 360);
    const cameraTarget = (
      indoorModelViewer as HTMLElement & { cameraTarget: string }
    ).cameraTarget.split(' ').map(Number.parseFloat);
    expect(cameraTarget[0]).toBeCloseTo(
      mapPlaneAnchorX * (1 - expectedScaleRatio),
    );
    expect(cameraTarget[1]).toBeCloseTo(0);
    expect(cameraTarget[2]).toBeCloseTo(0);

    expect(
      within(indoorMap).getByRole('status', { name: '실내 지도 불러오는 중' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '로봇 위치 지도' })).not.toBeInTheDocument();
    expect(createMap).toHaveBeenCalledOnce();

    if (indoorModelViewer === null) throw new Error('실내 model-viewer가 필요합니다.');
    fireEvent.error(indoorModelViewer);
    expect(within(indoorMap).getByRole('alert')).toHaveTextContent(
      '실내 지도를 표시할 수 없습니다.',
    );
    await user.click(within(indoorMap).getByRole('button', { name: '다시 시도' }));
    expect(
      within(indoorMap).getByRole('status', { name: '실내 지도 불러오는 중' }),
    ).toBeInTheDocument();
    expect(indoorMap.querySelector('model-viewer')).toBe(indoorModelViewer);
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

    const selected = screen.getByRole('heading', { name: '정찰 로봇 01' }).closest('section');
    expect(selected).not.toBeNull();
    expect(await screen.findByRole('table', {
      name: '정찰 로봇 01 로봇 정보',
    })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영상 관제' })).toHaveAttribute(
      'href',
      '/control/monitoring/robot-001?siteId=pangyo-outdoor-zone',
    );
    expect(
      screen.getByRole('link', { name: '영상 관제' }).compareDocumentPosition(
        screen.getByRole('group', { name: '로봇 3D 모델' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(createMap).toHaveBeenCalledOnce();
  });

  it('검색 결과에서 벗어난 선택을 남기지 않고 첫 결과로 전환한다', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));
    await user.type(screen.getByRole('searchbox', { name: '로봇 검색' }), '정찰 로봇 01');

    const selected = screen.getByRole('heading', { name: '정찰 로봇 01' }).closest('section');
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
    const firstRobotButton = within(robotSelection as HTMLElement).getByRole('button', {
      name: /로봇 01/u,
    });
    expect(within(firstRobotButton).getByText('MOCK00001 · API name 01'))
      .toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '로봇 검색' }), '로봇 25');
    expect(await screen.findByRole('table', {
      name: '로봇 25 로봇 정보',
    })).toBeInTheDocument();
    expect(screen.queryByText(/검색 결과 \d+대/u)).not.toBeInTheDocument();
  });
});
