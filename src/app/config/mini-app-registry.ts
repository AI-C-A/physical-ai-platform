import type { MiniAppNavigationItem } from '@/widgets/platform-shell';

import { ROUTE_PATHS } from '../router/route-paths';

export const MINI_APP_REGISTRY = [
  {
    id: 'control',
    label: '관제',
    icon: 'radio',
    homePath: ROUTE_PATHS.controlMonitoring,
    items: [
      { label: '모니터링', path: ROUTE_PATHS.controlMonitoring, icon: 'activity' },
      { label: '개입 요청', path: ROUTE_PATHS.controlInterventions, icon: 'intervention' },
      { label: '로봇 관리', path: ROUTE_PATHS.controlRobots, icon: 'robot' },
      { label: '사이트 관리', path: ROUTE_PATHS.controlSites, icon: 'map' },
      { label: '경로·좌표 관리', path: ROUTE_PATHS.controlCoordinates, icon: 'route' },
      { label: '리포트', path: ROUTE_PATHS.controlReports, icon: 'report' },
    ],
  },
] as const satisfies readonly MiniAppNavigationItem[];
