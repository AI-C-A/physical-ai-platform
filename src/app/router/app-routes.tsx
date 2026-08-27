import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';

import { PageHeader } from '@/shared/ui/page-header';
import { PlatformShell } from '@/widgets/platform-shell';

import { MINI_APP_REGISTRY } from '../config';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { ROUTE_PATHS } from './route-paths';

const CoordinatesPage = lazy(async () => ({
  default: (await import('@/pages/control/coordinates')).CoordinatesPage,
}));
const InterventionsPage = lazy(async () => ({
  default: (await import('@/pages/control/interventions')).InterventionsPage,
}));
const ControlMonitoringPage = lazy(async () => ({
  default: (await import('@/pages/control/monitoring')).ControlMonitoringPage,
}));
const RobotMonitoringPage = lazy(async () => ({
  default: (await import('@/pages/control/monitoring')).RobotMonitoringPage,
}));
const ReportsPage = lazy(async () => ({
  default: (await import('@/pages/control/reports')).ReportsPage,
}));
const RobotsPage = lazy(async () => ({
  default: (await import('@/pages/control/robots')).RobotsPage,
}));
const SitesPage = lazy(async () => ({
  default: (await import('@/pages/control/sites')).SitesPage,
}));

export const APP_ROUTES: RouteObject[] = [
  {
    path: ROUTE_PATHS.root,
    element: <PlatformShell miniApps={MINI_APP_REGISTRY} />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate replace to={ROUTE_PATHS.controlMonitoring} />,
      },
      { path: ROUTE_PATHS.controlMonitoring, element: <ControlMonitoringPage /> },
      { path: ROUTE_PATHS.controlRobotMonitoring, element: <RobotMonitoringPage /> },
      { path: ROUTE_PATHS.controlInterventions, element: <InterventionsPage /> },
      { path: ROUTE_PATHS.controlRobots, element: <RobotsPage /> },
      { path: ROUTE_PATHS.controlSites, element: <SitesPage /> },
      { path: ROUTE_PATHS.controlCoordinates, element: <CoordinatesPage /> },
      { path: ROUTE_PATHS.controlReports, element: <ReportsPage /> },
      {
        path: '*',
        element: <PageHeader eyebrow="404" title="페이지를 찾을 수 없습니다" />,
      },
    ],
  },
];
