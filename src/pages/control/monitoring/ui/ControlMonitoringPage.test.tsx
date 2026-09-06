import { type PropsWithChildren, useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  createInMemoryRobotCatalog,
  createInMemoryRobotCatalogWithData,
  RobotCatalogContext,
  RobotCatalogAccessError,
  RobotOperationalStatusContext,
  type RobotCatalogPort,
  type RobotDescriptor,
  type RobotOperationalStatus,
  type RobotOperationalStatusQueryPort,
  type RobotOperationalStatusSubscriptionEvent,
} from '@/entities/robot';
import {
  RobotGeolocationContext,
  type RobotGeolocationObservation,
  type RobotGeolocationQueryPort,
} from '@/entities/robot-telemetry';
import {
  MapStylePreferenceProvider,
  useMapStylePreference,
  type MapStyleId,
} from '@/shared/config';
import { RouteMorphProvider } from '@/shared/ui/route-morph';
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
    fitBounds: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    off: vi.fn(),
    on: vi.fn<(event: string, listener: () => void) => void>(),
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
    createMarker: vi.fn(function Marker(options: { element?: HTMLElement; anchor?: string; color?: string }) {
      options.element?.setAttribute('role', 'img');
      return marker;
    }),
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
      isCharging: false,
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
  mapStyleId: MapStyleId = 'primary',
) {
  return render(
    <MapStylePreferenceProvider>
      <MapStyleSelectionGate styleId={mapStyleId}>
        <RobotCatalogContext.Provider value={catalog}>
          <RobotOperationalStatusContext.Provider value={status}>
            <RobotGeolocationContext.Provider value={location}>
              <MemoryRouter initialEntries={[initialEntry]}>
                <RouteMorphProvider>
                  <ControlMonitoringPage />
                  <CurrentLocation />
                </RouteMorphProvider>
              </MemoryRouter>
            </RobotGeolocationContext.Provider>
          </RobotOperationalStatusContext.Provider>
        </RobotCatalogContext.Provider>
      </MapStyleSelectionGate>
    </MapStylePreferenceProvider>,
  );
}

function MapStyleSelectionGate({
  children,
  styleId,
}: PropsWithChildren<{ readonly styleId: MapStyleId }>) {
  const { selectedStyle, selectMapStyle } = useMapStylePreference();

  useEffect(() => {
    if (selectedStyle.id !== styleId) selectMapStyle(styleId);
  }, [selectMapStyle, selectedStyle.id, styleId]);

  return selectedStyle.id === styleId ? children : null;
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
    window.localStorage.clear();
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-mapbox-access-token');
    vi.stubEnv('VITE_MAPBOX_STYLE_URL', 'mapbox://styles/test/style');
    vi.stubEnv(
      'VITE_MAPBOX_SECONDARY_STYLE_URL',
      'mapbox://styles/test/secondary-style',
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('로봇 목록 응답을 기다리는 중에도 지도를 표시하고 응답 후 유지한다', async () => {
    let resolveRobots!: (robots: readonly RobotDescriptor[]) => void;
    const pending = new Promise<readonly RobotDescriptor[]>((resolve) => { resolveRobots = resolve; });
    renderPage({ ...createInMemoryRobotCatalog([]), listRobots: () => pending });

    await waitFor(() => expect(createMap).toHaveBeenCalledOnce());
    const map = screen.getByRole('region', { name: '로봇 위치 지도' });
    expect(within(screen.getByRole('region', { name: '로봇 선택' })).getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(createMarker).not.toHaveBeenCalled();

    await act(async () => { resolveRobots([createRobot(1)]); await pending; });
    expect(await screen.findByRole('button', { name: /로봇 01/u })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '로봇 위치 지도' })).toBe(map);
    expect(createMap).toHaveBeenCalledOnce();
  });

  it.each([
    { error: new Error('Failed to fetch'), message: '로봇 목록을 불러오지 못했습니다.' },
    { error: new RobotCatalogAccessError('access-denied'), message: '등록된 로봇을 조회할 권한이 없습니다.' },
    { error: new RobotCatalogAccessError('authentication'), message: '로봇 연동 인증에 실패했습니다.' },
  ])('$message 오류와 재시도 중에도 지도를 유지한다', async ({ error, message }) => {
    const user = userEvent.setup();
    let resolveRetry!: (robots: readonly RobotDescriptor[]) => void;
    const retry = new Promise<readonly RobotDescriptor[]>((resolve) => { resolveRetry = resolve; });
    const listRobots = vi.fn<RobotCatalogPort['listRobots']>()
      .mockRejectedValueOnce(error)
      .mockReturnValueOnce(retry);
    renderPage({ ...createInMemoryRobotCatalog([]), listRobots }, undefined, undefined,
      '/control/monitoring?siteId=pangyo-outdoor-zone&mode=multi&robotId=robot-001&robotId=robot-002');

    expect(await within(screen.getByRole('region', { name: '로봇 선택' })).findByRole('alert')).toHaveTextContent(message);
    await waitFor(() => expect(createMap).toHaveBeenCalledOnce());
    const map = screen.getByRole('region', { name: '로봇 위치 지도' });
    expect(createMarker).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '다중 관제 시작' })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: '로봇 검색' })).not.toBeInTheDocument();
    expect(screen.queryByText('조건에 맞는 로봇이 없습니다.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(screen.getByRole('region', { name: '로봇 위치 지도' })).toBe(map);
    await act(async () => { resolveRetry([createRobot(1), createRobot(2)]); await retry; });
    expect(await screen.findByRole('checkbox', { name: /로봇 01/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다중 관제 시작' })).toBeEnabled();
    expect(screen.getByRole('region', { name: '로봇 위치 지도' })).toBe(map);
    expect(createMap).toHaveBeenCalledOnce();
    expect(listRobots).toHaveBeenCalledTimes(2);
  });

  it('등록된 로봇이 없어도 지도를 표시한다', async () => {
    renderPage(createInMemoryRobotCatalog([]));

    expect(await screen.findByText('등록된 로봇이 없습니다.')).toBeInTheDocument();
    await waitFor(() => expect(createMap).toHaveBeenCalledOnce());
    expect(screen.getByRole('region', { name: '로봇 위치 지도' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다중 선택' })).not.toBeInTheDocument();
    expect(createMarker).not.toHaveBeenCalled();
  });

  it('로봇 조회가 실패해도 사이트를 실내 지도로 전환할 수 있다', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('WebGLRenderingContext', class {});
    vi.spyOn(customElements, 'get').mockReturnValue(class extends HTMLElement {});
    renderPage({ ...createInMemoryRobotCatalog([]), listRobots: () => Promise.reject(new Error('offline')) });

    await screen.findByText('로봇 목록을 불러오지 못했습니다.');
    const siteSelect = screen.getByRole('combobox', { name: '사이트' });
    siteSelect.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', { name: '판교 육군 AX 거점' });
    await user.keyboard('{ArrowDown}{Enter}');

    const indoorMap = await screen.findByRole('region', { name: '판교 육군 AX 거점 실내 지도' });
    expect(indoorMap.querySelector('model-viewer')).toHaveAttribute('src', '/assets/sites/pangyo-v1.glb');
    expect(screen.getByText('로봇 목록을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent('siteId=pangyo-army-ax-hub');
  });

  it('설정에서 선택한 추가 스타일 URL로 Mapbox 지도를 생성한다', async () => {
    renderPage(
      undefined,
      undefined,
      undefined,
      '/control/monitoring',
      'secondary',
    );

    await waitFor(() => {
      expect(createMap).toHaveBeenCalledWith(expect.objectContaining({
        style: 'mapbox://styles/test/secondary-style',
      }));
    });
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

  it('지도 초기화 실패 후 재시도하며 로봇 목록을 계속 사용할 수 있다', async () => {
    const user = userEvent.setup();
    createMap.mockImplementationOnce(function Map() { throw new Error('WebGL unavailable'); });
    renderPage();

    const retry = await screen.findByRole('button', { name: '지도 다시 불러오기' });
    expect(screen.getByRole('region', { name: '로봇 선택' })).toBeInTheDocument();
    await user.click(retry);
    await waitFor(() => expect(createMap).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: '지도 다시 불러오기' })).not.toBeInTheDocument();
  });

  it('지도 탐색 중 자동 추적을 멈추고 선택 위치로 돌아갈 수 있다', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));
    const follow = await screen.findByRole('button', { name: '위치 따라가기' });
    expect(follow).toHaveAttribute('aria-pressed', 'true');

    const onDrag = mapInstance.on.mock.calls.find(([event]) => event === 'dragstart')?.[1];
    act(() => onDrag?.());
    expect(follow).toHaveAttribute('aria-pressed', 'false');
    easeTo.mockClear();
    await user.click(follow);
    expect(follow).toHaveAttribute('aria-pressed', 'true');
    expect(easeTo).toHaveBeenCalledWith({ center: [20, 10], duration: 600 });
  });

  it('수신된 전체 기체 위치를 표시하고 지도 핀으로 관제 기체를 선택한다', async () => {
    const user = userEvent.setup();
    const status: RobotOperationalStatusQueryPort = {
      ...operationalStatus,
      getOperationalStatus: (robotId) => {
        const value = createOperationalStatus(robotId);
        return Promise.resolve({ ...value, data: { ...value.data, latitude: 37.39, longitude: 127.11 } });
      },
    };
    renderPage(undefined, status);

    await screen.findByRole('button', { name: '전체 위치' });
    const robotCount = (await createInMemoryRobotCatalogWithData().listRobots()).length;
    await waitFor(() => expect(createMarker.mock.calls.filter(([options]) => options.element !== undefined)).toHaveLength(robotCount));
    const markers = createMarker.mock.calls.flatMap(([options]) => options.element === undefined ? [] : [options.element]);
    expect(markers).toHaveLength(robotCount);
    const marker = markers.find((element) => element.getAttribute('aria-label') === '수송 로봇 02 위치 선택');
    expect(marker).toBeDefined();
    expect(marker).toHaveAttribute('role', 'button');
    fireEvent.click(marker as HTMLElement);
    expect(await screen.findByRole('region', { name: '수송 로봇 02 로봇 패널' })).toBeInTheDocument();
    expect(marker).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByRole('searchbox', { name: '로봇 검색' }), '정찰');
    expect(createMarker.mock.calls.filter(([options]) => options.element !== undefined)).toHaveLength(markers.length);
    await user.click(screen.getByRole('button', { name: '전체 위치' }));
    expect(mapInstance.fitBounds).toHaveBeenCalledWith([[127.11, 37.39], [127.11, 37.39]], expect.objectContaining({ maxZoom: 18 }));
  });

  it.each([
    { label: '별도 위치 API가 null일 때', fallback: null },
    { label: '별도 위치 API에 이전 좌표가 있을 때', fallback: createGeolocation('robot-001') },
  ])('$label 선택 핀과 카메라는 실시간 상태 좌표를 따른다', async ({ fallback }) => {
    const user = userEvent.setup();
    const robot = createRobot(1);
    let current = createOperationalStatus(robot.id);
    current = { ...current, data: { ...current.data, latitude: 37.39, longitude: 127.11 } };
    const listeners = new Set<(event: RobotOperationalStatusSubscriptionEvent) => void>();
    renderPage(createInMemoryRobotCatalog([robot]), {
      ...operationalStatus,
      getOperationalStatus: () => Promise.resolve(current),
      subscribeOperationalStatuses: (_ids, listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    }, { getGeolocationObservation: () => Promise.resolve(fallback) });

    await screen.findByRole('button', { name: '전체 위치' });
    await user.click(screen.getByRole('button', { name: /로봇 01/u }));
    const follow = await screen.findByRole('button', { name: '위치 따라가기' });
    await waitFor(() => expect(easeTo).toHaveBeenLastCalledWith({ center: [127.11, 37.39], duration: 600 }));
    expect(setMarkerLngLat).toHaveBeenLastCalledWith([127.11, 37.39]);
    const markerCount = createMarker.mock.calls.length;

    current = { ...current, data: { ...current.data, battery: 84, latitude: 37.4, longitude: 127.12 } };
    easeTo.mockClear();
    setMarkerLngLat.mockClear();
    act(() => listeners.forEach((listener) => listener({ kind: 'updated', robotId: robot.id })));
    const detail = within(screen.getByRole('region', { name: '로봇 01 로봇 정보' }));
    await detail.findByRole('group', { name: '배터리 84%' });
    await waitFor(() => expect(easeTo).toHaveBeenLastCalledWith({ center: [127.12, 37.4], duration: 600 }));
    expect(setMarkerLngLat).toHaveBeenLastCalledWith([127.12, 37.4]);
    expect(createMarker).toHaveBeenCalledTimes(markerCount);

    await user.click(follow);
    easeTo.mockClear();
    current = { ...current, data: { ...current.data, battery: 83, latitude: 37.41, longitude: 127.13 } };
    act(() => listeners.forEach((listener) => listener({ kind: 'updated', robotId: robot.id })));
    await detail.findByRole('group', { name: '배터리 83%' });
    expect(setMarkerLngLat).toHaveBeenLastCalledWith([127.13, 37.41]);
    expect(easeTo).not.toHaveBeenCalled();
  });

  it('로봇을 바꾸어 선택해도 목록의 구독과 조회를 공유하고 해당 로봇의 오류만 표시한다', async () => {
    const user = userEvent.setup();
    const robots = [createRobot(1), createRobot(2)];
    const listeners = new Set<(event: RobotOperationalStatusSubscriptionEvent) => void>();
    const getOperationalStatus = vi.fn((robotId: string) => Promise.resolve(createOperationalStatus(robotId)));
    const subscribe = vi.fn((ids: readonly string[], listener: (event: RobotOperationalStatusSubscriptionEvent) => void) => {
      if (ids.length === 0) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    });
    renderPage(createInMemoryRobotCatalog(robots), {
      ...operationalStatus, getOperationalStatus, subscribeOperationalStatuses: subscribe,
    });
    await user.click(await screen.findByRole('button', { name: /로봇 01/u }));
    await user.click(screen.getByRole('button', { name: /로봇 02/u }));
    await user.click(screen.getByRole('button', { name: /로봇 01/u }));
    expect(getOperationalStatus).toHaveBeenCalledTimes(2);
    expect(subscribe.mock.calls.filter(([ids]) => ids.length > 0)).toEqual([
      [['robot-001', 'robot-002'], expect.any(Function)],
    ]);
    expect(listeners.size).toBe(1);

    const stale = (robotId: string): RobotOperationalStatusSubscriptionEvent => ({
      kind: 'stale', robotId, lastSuccessfulAtMs: 1_700_000_000_000,
      message: '실시간 연결을 확인해 주세요.', reason: 'gateway-unreachable',
    });
    act(() => listeners.forEach((listener) => listener(stale('robot-002'))));
    const detail = within(screen.getByRole('region', { name: '로봇 01 로봇 정보' }));
    expect(detail.queryByRole('region', { name: '실시간 연결 끊김' })).not.toBeInTheDocument();
    act(() => listeners.forEach((listener) => listener(stale('robot-001'))));
    expect(detail.getByRole('region', { name: '실시간 연결 끊김' })).toBeInTheDocument();
    await user.click(detail.getByRole('button', { name: '연결 다시 확인' }));
    await waitFor(() => expect(getOperationalStatus).toHaveBeenCalledTimes(4));
    expect(listeners.size).toBe(1);
    expect(subscribe.mock.calls.filter(([ids]) => ids.length > 0)).toHaveLength(2);
    expect(detail.queryByRole('region', { name: '실시간 연결 끊김' })).not.toBeInTheDocument();
  });

  it('목록의 운영 상태를 기다리는 동안 상세가 별도 조회하지 않고 실패 후 같은 쿼리를 재시도한다', async () => {
    const user = userEvent.setup();
    let rejectInitial: (reason: Error) => void = () => undefined;
    const initial = new Promise<RobotOperationalStatus | null>((_resolve, reject) => { rejectInitial = reject; });
    const getOperationalStatus = vi.fn()
      .mockImplementationOnce(() => initial)
      .mockResolvedValue(createOperationalStatus('robot-001'));
    renderPage(createInMemoryRobotCatalog([createRobot(1)]), {
      ...operationalStatus, getOperationalStatus,
    });
    await user.click(await screen.findByRole('button', { name: /로봇 01/u }));
    const detail = within(screen.getByRole('region', { name: '로봇 01 로봇 정보' }));
    expect(detail.getByRole('status', { name: '운영 정보 불러오는 중' })).toBeInTheDocument();
    expect(getOperationalStatus).toHaveBeenCalledOnce();
    act(() => rejectInitial(new Error('internal transport failure')));
    expect(await detail.findByRole('alert')).toHaveTextContent('로봇 정보를 불러오지 못했습니다.');
    await user.click(detail.getByRole('button', { name: '다시 불러오기' }));
    await detail.findByRole('group', { name: '배터리 100%' });
    expect(getOperationalStatus).toHaveBeenCalledTimes(2);
  });

  it('필터와 정렬 셀렉터 없이 전체 로봇 목록에 저전력 상태를 표시한다', async () => {
    const user = userEvent.setup();
    const status: RobotOperationalStatusQueryPort = {
      ...operationalStatus,
      getOperationalStatus: (robotId) => {
        const value = createOperationalStatus(robotId);
        return Promise.resolve({ ...value, data: { ...value.data, battery: robotId === 'robot-001' ? 15 : 90 } });
      },
    };
    renderPage(undefined, status);
    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));
    expect(screen.queryByRole('group', { name: '로봇 상태 필터' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '로봇 정렬' })).not.toBeInTheDocument();
    const list = within(screen.getByRole('region', { name: '로봇 선택' })).getByRole('list');
    expect(within(list).getAllByRole('button')).toHaveLength((await createInMemoryRobotCatalogWithData().listRobots()).length);
    expect(within(list).getByRole('button', { name: /정찰 로봇 01/u })).toHaveTextContent('배터리 부족');
    expect(screen.getByRole('region', { name: '수송 로봇 02 로봇 패널' })).toBeInTheDocument();
  });

  it('내부 응답 검증 상세를 UI에 표시하지 않는다', async () => {
    const user = userEvent.setup();
    renderPage(createInMemoryRobotCatalogWithData(), {
      listOperationalDataSources: () => Promise.resolve([]),
      getOperationalStatus: () => Promise.reject(
        new Error('Robot 운영 상태.data 응답은 객체여야 합니다.'),
      ),
    });
    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로봇 정보를 불러오지 못했습니다.',
    );
    expect(screen.queryByText(/Robot 운영 상태|\.data|객체여야/u)).not.toBeInTheDocument();
  });

  it('3D 뷰어 기본 로딩 표시 대신 공용 스피너를 표시한다', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('WebGLRenderingContext', class {});
    vi.spyOn(customElements, 'get').mockReturnValue(class extends HTMLElement {});
    renderPage();
    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));

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

  it('사이트 드롭다운과 제목 없는 로봇 선택 패널을 Mapbox 배경 위에 표시한다', async () => {
    const user = userEvent.setup();
    renderPage();

    const pageHeading = await screen.findByRole('heading', {
      level: 1,
      name: '모니터링',
    });
    expect(pageHeading).toHaveClass('sr-only');
    const siteSelect = screen.getByRole('combobox', { name: '사이트' });
    const robotSelection = screen.getByRole('region', { name: '로봇 선택' });
    expect(siteSelect).toHaveTextContent(
      '판교',
    );
    expect(siteSelect).not.toHaveTextContent('· 실외');
    expect(siteSelect.closest('section')).toBeNull();
    const selectionColumn = siteSelect.parentElement?.parentElement;
    expect(selectionColumn).not.toHaveClass('overflow-hidden');
    expect(siteSelect.querySelector('.lucide-map-pin')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '사이트 선택' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '로봇 선택' })).not.toBeInTheDocument();
    const robotSearch = screen.getByRole('searchbox', { name: '로봇 검색' });
    expect(robotSearch).toHaveAccessibleName('로봇 검색');
    const robotSearchIcon = robotSearch.parentElement?.querySelector('.lucide-search');
    expect(robotSearchIcon).toBeInTheDocument();
    expect(robotSearchIcon?.parentElement).toHaveClass('z-10');
    for (const control of [siteSelect, robotSearch]) {
      expect(control).toHaveClass('ui-field', 'rounded-[var(--design-radius-field)]');
    }
    expect(siteSelect).toHaveClass('min-h-[var(--layout-control-height-large)]');
    expect(robotSearch).toHaveClass('min-h-[var(--layout-control-height)]');
    expect(siteSelect).toHaveAttribute('data-surface', 'overlay');
    expect(robotSearch).toHaveAttribute('data-surface', 'default');
    expect(screen.queryByRole('button', { name: '로봇 정보 패널 닫기' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '로봇 3D 모델' }))
      .not.toBeInTheDocument();
    const fallbackNameButton = within(robotSelection).getByRole('button', {
      name: /수송 로봇 02/u,
    });
    expect(fallbackNameButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(fallbackNameButton);

    const robotInfoPanel = await screen.findByRole('region', {
      name: '수송 로봇 02 로봇 패널',
    });
    for (const mapOverlaySurface of [
      robotSelection,
      robotInfoPanel,
    ]) {
      expect(mapOverlaySurface).toHaveClass(
        'rounded-[var(--design-radius-surface)]',
        'border-0',
        'bg-surface-muted/[0.88]',
        'shadow-xl',
        'backdrop-blur-[var(--design-backdrop-blur-floating)]',
      );
      expect(mapOverlaySurface).not.toHaveClass('shadow-foreground/10');
      expect(mapOverlaySurface.querySelector('[data-monitoring-panel-surface]'))
        .not.toBeInTheDocument();
    }
    expect(robotSearch).not.toHaveAttribute('data-direct-surface');
    expect(within(robotInfoPanel).queryByRole('heading', { name: '수송 로봇 02' }))
      .not.toBeInTheDocument();
    expect(within(fallbackNameButton).getByText('N0000002')).toBeInTheDocument();
    expect(fallbackNameButton).toHaveClass(
      'rounded-[var(--design-radius-list-row)]',
      'border-0',
      'bg-foreground/[0.06]',
    );
    expect(fallbackNameButton).not.toHaveClass('backdrop-blur-[var(--design-backdrop-blur-floating)]');
    expect(fallbackNameButton).not.toHaveAttribute('data-direct-surface');
    expect(within(fallbackNameButton).queryByText('N0000002 · 수송 로봇 02'))
      .not.toBeInTheDocument();
    const modelViewer = screen.getByRole('group', { name: '로봇 3D 모델' });
    expect(modelViewer.parentElement).not.toHaveAttribute('data-direct-surface');
    expect(modelViewer.parentElement).not.toHaveClass(
      'bg-neutral-50/[0.64]',
      'backdrop-blur-[var(--design-backdrop-blur-floating)]',
    );
    const modelViewerElement = modelViewer.querySelector('model-viewer');
    const nickname = within(modelViewer).getByText('Mock Robot');
    expect(nickname.tagName).toBe('FIGCAPTION');
    expect(nickname).toHaveClass(
      'mt-2',
      'text-xl',
      'font-medium',
      'md:mt-4',
      'md:text-4xl',
      'md:font-light',
      'text-left',
    );
    expect(nickname).not.toHaveClass('absolute');
    expect(modelViewerElement).toHaveAttribute('src', '/assets/go2_walk-monitoring.glb');
    expect(modelViewerElement).toHaveAttribute('camera-orbit', '-135deg 65deg 105%');
    expect(modelViewerElement).toHaveAttribute('autoplay');
    expect(modelViewerElement).not.toHaveAttribute('auto-rotate');
    expect(modelViewerElement).not.toHaveAttribute('rotation-per-second');
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

    const infoOverview = await screen.findByRole('region', {
      name: '수송 로봇 02 로봇 정보',
    });
    expect(within(infoOverview).getByRole('group', {
      name: '배터리 100%',
    })).toBeInTheDocument();
    expect(within(infoOverview).queryByText('온라인')).not.toBeInTheDocument();
    expect(within(infoOverview).getByText(
      'GPS 신호를 수신하지 못했습니다.',
    )).toBeInTheDocument();
    expect(within(infoOverview).queryByText('0° N')).not.toBeInTheDocument();
    expect(within(infoOverview).queryByText('0° E')).not.toBeInTheDocument();
    expect(within(infoOverview).getByText('MOCK00001')).toBeInTheDocument();
    expect(within(infoOverview).queryByText('null', { exact: true }))
      .not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/control/monitoring?siteId=pangyo-outdoor-zone',
      );
    });

    const closeRobotInfo = within(robotInfoPanel).getByRole('button', {
      name: '로봇 정보 패널 닫기',
    });
    expect(closeRobotInfo.querySelector('.lucide-x')).toBeInTheDocument();
    expect(closeRobotInfo).toHaveClass(
      'size-10',
      'bg-transparent',
      'shadow-none',
    );
    expect(closeRobotInfo).not.toHaveClass(
      'rounded-full',
      'bg-surface-muted/80',
      'shadow-sm',
      'backdrop-blur-sm',
    );
    await user.click(closeRobotInfo);

    expect(screen.queryByRole('region', { name: '수송 로봇 02 로봇 패널' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '로봇 3D 모델' }))
      .not.toBeInTheDocument();
    expect(fallbackNameButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('연결되지 않은 로봇을 읽을 수 있는 상태 문구로 표시한다', async () => {
    const status: RobotOperationalStatusQueryPort = {
      listOperationalDataSources: () => Promise.resolve([]),
      getOperationalStatus: (robotId) => {
        const result = createOperationalStatus(robotId);
        return Promise.resolve({
          ...result,
          data: {
            ...result.data,
            isConnecting: robotId !== 'robot-001',
          },
        });
      },
    };
    renderPage(createInMemoryRobotCatalogWithData(), status);

    const robotSelection = await screen.findByRole('region', { name: '로봇 선택' });
    const disconnectedRobot = within(robotSelection).getByRole('button', {
      name: /정찰 로봇 01/u,
    });
    const connectedRobot = within(robotSelection).getByRole('button', {
      name: /수송 로봇 02/u,
    });

    await waitFor(() => expect(disconnectedRobot).toHaveTextContent('미연결'));
    expect(within(disconnectedRobot).getByText('미연결')).toHaveClass('text-muted');
    expect(disconnectedRobot.querySelector('.lucide-wifi-off')).toBeNull();
    expect(disconnectedRobot).not.toHaveClass('opacity-50');
    expect(connectedRobot).not.toHaveTextContent('연결됨');
    expect(connectedRobot).not.toHaveClass('opacity-50');
  });

  it.each(['single', 'multiple'] as const)('%s 목록에서 충전 아이콘을 배터리 옆에 표시하며 미연결 문구를 유지한다', async (mode) => {
    renderPage(createInMemoryRobotCatalogWithData(), {
      ...operationalStatus,
      getOperationalStatus: (robotId) => {
        const result = createOperationalStatus(robotId);
        return Promise.resolve({
          ...result,
          data: { ...result.data, battery: 80, isConnecting: robotId !== 'robot-001', isCharging: robotId !== 'robot-003' },
        });
      },
    }, undefined, `/control/monitoring${mode === 'multiple' ? '?mode=multi' : ''}`);

    const selection = within(await screen.findByRole('region', { name: '로봇 선택' }));
    const role = mode === 'multiple' ? 'checkbox' : 'button';
    const getRow = async (name: RegExp) => {
      const control = await selection.findByRole(role, { name });
      return control.closest('label') ?? control;
    };
    const offline = await getRow(/정찰 로봇 01/u);
    const online = await getRow(/수송 로봇 02/u);
    const notCharging = await getRow(/정찰 로봇 03/u);

    await waitFor(() => expect(offline).toHaveTextContent('미연결'));
    for (const row of [offline, online]) {
      const charging = within(row).getByRole('img', { name: '충전 중' });
      expect(charging.parentElement).toContainElement(within(row).getByLabelText('배터리 80%'));
      expect(within(row).queryByText('충전 중')).not.toBeInTheDocument();
      expect(within(row).queryByText('연결됨')).not.toBeInTheDocument();
    }
    expect(within(notCharging).queryByRole('img', { name: '충전 중' })).not.toBeInTheDocument();
    expect(within(notCharging).getByLabelText('배터리 80%')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /수송 로봇 02/u }));
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
    const videoMonitoringLink = screen.getByRole('link', { name: '영상 관제' });
    expect(videoMonitoringLink).toHaveClass(
      'mt-4',
      'w-full',
      'shrink-0',
      'min-h-12',
      'rounded-[var(--design-radius-control)]',
      'border-0',
      'bg-action-primary',
      'text-action-on-fill',
    );
    expect(videoMonitoringLink).toHaveAttribute(
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
    const user = userEvent.setup();
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
    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));

    await screen.findByRole('region', { name: '수송 로봇 02 로봇 정보' });
    await waitFor(() => {
      expect(createMarker).toHaveBeenCalledWith({ color: 'var(--action-primary)' });
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

    expect(screen.queryByRole('button', { name: '로봇 정보 패널 닫기' }))
      .not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));
    await screen.findByRole('region', { name: '수송 로봇 02 로봇 정보' });
    await waitFor(() => expect(createMap).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: /정찰 로봇 01/u }));

    expect(screen.getByRole('region', { name: '정찰 로봇 01 로봇 패널' }))
      .toBeInTheDocument();
    expect(await screen.findByRole('region', {
      name: '정찰 로봇 01 로봇 정보',
    })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영상 관제' })).toHaveAttribute(
      'href',
      '/control/monitoring/robot-001?siteId=pangyo-outdoor-zone',
    );
    expect(
      screen.getByRole('group', { name: '로봇 3D 모델' }).compareDocumentPosition(
        screen.getByRole('link', { name: '영상 관제' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(createMap).toHaveBeenCalledOnce();
  });

  it('검색 결과가 없어도 입력 포커스를 유지하고 검색어를 전용 버튼으로 지운다', async () => {
    const user = userEvent.setup();
    renderPage();

    const search = await screen.findByRole('searchbox', { name: '로봇 검색' });
    expect(search).toHaveAttribute('type', 'text');
    expect(screen.queryByRole('button', { name: '로봇 검색어 모두 지우기' }))
      .not.toBeInTheDocument();

    await user.type(search, 'ㄹ');

    expect(screen.getByRole('searchbox', { name: '로봇 검색' })).toBe(search);
    expect(search).toHaveValue('ㄹ');
    expect(search).toHaveFocus();
    expect(screen.getByText('조건에 맞는 로봇이 없습니다.')).toBeInTheDocument();

    const clearSearch = screen.getByRole('button', { name: '로봇 검색어 모두 지우기' });
    expect(clearSearch).toHaveClass('size-8', 'rounded-[var(--design-radius-round)]');
    expect(clearSearch.querySelector('.lucide-x')).toBeInTheDocument();

    await user.click(clearSearch);

    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(screen.queryByRole('button', { name: '로봇 검색어 모두 지우기' }))
      .not.toBeInTheDocument();
  });

  it('검색 결과에서 벗어나도 확인 중인 로봇을 다른 기체로 바꾸지 않는다', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /수송 로봇 02/u }));
    await user.type(screen.getByRole('searchbox', { name: '로봇 검색' }), '정찰 로봇 01');

    const selected = screen.getByRole('region', { name: '수송 로봇 02 로봇 패널' });
    expect(await within(selected).findByRole('region', {
      name: '수송 로봇 02 로봇 정보',
    })).toBeInTheDocument();
    expect(within(selected).queryByRole('region', {
      name: '정찰 로봇 01 로봇 정보',
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

    const robotSelection = await screen.findByRole('region', { name: '로봇 선택' });
    const firstRobotButton = within(robotSelection).getByRole('button', {
      name: /로봇 01/u,
    });
    await user.click(firstRobotButton);
    expect(await screen.findByRole('region', {
      name: '로봇 01 로봇 정보',
    })).toBeInTheDocument();
    expect(listRobots).toHaveBeenCalledOnce();
    expect(queryRobots).not.toHaveBeenCalled();
    expect(screen.queryByRole('navigation', { name: '페이지 이동' })).not.toBeInTheDocument();
    expect(screen.queryByText(/검색 결과 \d+대/u)).not.toBeInTheDocument();

    expect(within(within(robotSelection).getByRole('list')).getAllByRole('button')).toHaveLength(25);
    expect(within(firstRobotButton).getByText('MOCK00001 · API name 01'))
      .toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '로봇 검색' }), '로봇 25');
    expect(await screen.findByRole('region', {
      name: '로봇 01 로봇 정보',
    })).toBeInTheDocument();
    expect(screen.queryByText(/검색 결과 \d+대/u)).not.toBeInTheDocument();
  });

  it('다중 선택 모드에서 2대 선택을 URL에 보존하고 다중 관제로 이동한다', async () => {
    const user = userEvent.setup();
    renderPage(
      createInMemoryRobotCatalogWithData(),
      operationalStatus,
      geolocation,
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    );

    const modeAction = await screen.findByRole('button', { name: '다중 선택' });
    expect(screen.queryByRole('heading', { name: '로봇 목록' }))
      .not.toBeInTheDocument();
    expect(modeAction).toHaveTextContent('선택');
    expect(modeAction).toHaveClass('min-w-10', 'bg-transparent');
    expect(modeAction).not.toHaveClass('w-full');
    await user.click(modeAction);
    const selection = screen.getByRole('list', {
      name: '다중 관제 로봇 선택',
    });
    const start = screen.getByRole('button', { name: '다중 관제 시작' });
    const cancel = screen.getByRole('button', { name: '선택 취소' });
    const firstCheckbox = within(selection).getByRole('checkbox', {
      name: /정찰 로봇 01/u,
    });
    expect(selection).toHaveClass('mt-3', 'grid', 'gap-1', 'pr-1');
    expect(selection).not.toHaveClass('divide-y');
    expect(firstCheckbox.closest('label')).toHaveClass(
      'min-h-[var(--layout-control-height)]',
      'rounded-[var(--design-radius-list-row)]',
      'flex-row-reverse',
    );
    expect(cancel).toBe(modeAction);
    expect(cancel).toHaveTextContent('취소');
    expect(cancel).toHaveClass('min-w-10', 'bg-transparent');
    expect(start).toHaveClass('bg-action-primary');
    expect(start).toHaveClass('w-full');
    expect(start).toHaveAttribute(
      'data-route-morph-id',
      'control-monitoring:multi',
    );
    expect(start).toBeDisabled();

    await user.click(firstCheckbox);
    await user.click(within(selection).getByRole('checkbox', {
      name: /수송 로봇 02/u,
    }));

    expect(start).toHaveTextContent('2/6');
    expect(start).toBeEnabled();
    await user.type(screen.getByRole('searchbox', { name: '로봇 검색' }), '지원 로봇');
    expect(start).toHaveTextContent('2/6');

    await user.click(start);
    await waitFor(() => {
      expect(screen.getByTestId('current-location')).toHaveTextContent(
        '/control/monitoring/multi?siteId=pangyo-army-ax-hub&mode=multi&robotId=robot-001&robotId=robot-002',
      );
    });
  });

  it('다중 선택은 최대 6대로 제한하고 취소하면 선택 URL을 제거한다', async () => {
    const user = userEvent.setup();
    const allRobots = Array.from({ length: 7 }, (_, index) => createRobot(index + 1));
    const catalog = createInMemoryRobotCatalogWithData();
    const selectedQuery = allRobots.slice(0, 6)
      .map((robot) => `robotId=${robot.id}`)
      .join('&');
    renderPage(
      {
        getRobot: (robotId) => catalog.getRobot(robotId),
        listRobots: () => Promise.resolve(allRobots),
        queryRobots: (query) => catalog.queryRobots(query),
      },
      operationalStatus,
      geolocation,
      `/control/monitoring?mode=multi&${selectedQuery}`,
    );

    const selection = await screen.findByRole('list', {
      name: '다중 관제 로봇 선택',
    });
    expect(within(selection).getByRole('checkbox', {
      name: /로봇 07/u,
    })).toBeDisabled();
    expect(within(selection).getByRole('checkbox', {
      name: /로봇 01/u,
    })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '선택 취소' }));
    expect(screen.queryByRole('list', {
      name: '다중 관제 로봇 선택',
    })).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/control/monitoring?siteId=pangyo-outdoor-zone',
    );
  });

  it('Escape로 다중 선택을 종료하고 상단 모드 버튼에 포커스를 복원한다', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '다중 선택' }));
    const firstCheckbox = screen.getByRole('checkbox', {
      name: /정찰 로봇 01/u,
    });
    firstCheckbox.focus();
    await user.keyboard('{Escape}');

    const modeAction = screen.getByRole('button', { name: '다중 선택' });
    expect(modeAction).toHaveFocus();
    expect(screen.queryByRole('list', {
      name: '다중 관제 로봇 선택',
    })).not.toBeInTheDocument();
  });
});
