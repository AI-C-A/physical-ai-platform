import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '@/shared/config';

import { createApplicationServices } from '../composition/application-services';
import { DEFAULT_BRANDING } from '../config';
import { AppProviders } from '../providers';
import { APP_ROUTES } from './app-routes';

vi.mock('mapbox-gl', () => ({
  default: {
    AttributionControl: vi.fn(function AttributionControl() { return {}; }),
    Map: vi.fn(function Map() {
      return {
        addControl: vi.fn(),
        easeTo: vi.fn(),
        fitBounds: vi.fn(),
        isStyleLoaded: vi.fn(() => true),
        on: vi.fn(),
        off: vi.fn(),
        remove: vi.fn(),
      };
    }),
    Marker: vi.fn(function Marker() {
      return {
        addTo: vi.fn(),
        getElement: vi.fn(() => ({ setAttribute: vi.fn() })),
        remove: vi.fn(),
        setLngLat: vi.fn(),
      };
    }),
  },
}));

const runtimeConfig: RuntimeConfig = {
  branding: DEFAULT_BRANDING,
  adapters: { mode: 'bundle', implementation: 'in-memory' },
  connections: {
    patrol: { endpoint: null },
    telemetry: { endpoint: null, integrationProfileId: null },
    video: { endpoint: null },
    capture: { endpoint: null },
  },
};

function renderRoute(path: string) {
  const services = createApplicationServices(runtimeConfig);
  const router = createMemoryRouter(APP_ROUTES, { initialEntries: [path] });
  return render(
    <AppProviders branding={DEFAULT_BRANDING} services={services}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe('App routes', () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    ['/collect/quest', 'Quest Hand Pose 수집'],
    ['/control/interventions', '개입 요청'],
    ['/control/sites', '사이트 관리'],
    ['/control/coordinates', '경로·좌표 관리'],
    ['/control/reports', '리포트'],
    ['/control/settings', '설정'],
    ['/mlops/settings', '설정'],
    ['/bigdata/settings', '설정'],
  ])('%s 경로에서 %s 화면을 렌더링한다', async (path, heading) => {
    renderRoute(path);
    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument();
  });

  it('지도 스타일 설정은 Control 설정 경로에만 노출한다', async () => {
    const controlSettings = renderRoute('/control/settings');
    expect(
      await screen.findByRole('heading', { name: '지도 스타일' }),
    ).toBeInTheDocument();
    controlSettings.unmount();

    renderRoute('/mlops/settings');
    expect(
      await screen.findByRole('heading', { name: '설정' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '지도 스타일' }),
    ).not.toBeInTheDocument();
  });

  it('루트에서 모니터링으로 이동한다', async () => {
    renderRoute('/');
    expect(
      await screen.findByRole('heading', { name: '모니터링' }),
    ).toBeInTheDocument();
  });

  it.each([
    '/missing',
    '/not-found',
  ])('알 수 없는 %s 경로를 redirect하지 않는다', async (path) => {
    renderRoute(path);
    expect(
      await screen.findByRole('heading', {
        name: '페이지를 찾을 수 없습니다',
      }),
    ).toBeInTheDocument();
  });

});
