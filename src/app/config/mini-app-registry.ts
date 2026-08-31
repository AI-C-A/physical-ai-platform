import type { MiniAppNavigationItem } from '@/widgets/platform-shell';

import { ROUTE_PATHS } from '../router/route-paths';

export const MINI_APP_REGISTRY = [
  {
    id: 'control',
    label: '관제',
    icon: 'radio',
    homePath: ROUTE_PATHS.controlMonitoring,
    settingsPath: ROUTE_PATHS.controlSettings,
    items: [
      {
        label: '모니터링',
        path: ROUTE_PATHS.controlMonitoring,
        icon: 'activity',
      },
      {
        label: '개입 요청',
        path: ROUTE_PATHS.controlInterventions,
        icon: 'intervention',
      },
      {
        label: '로봇 관리',
        path: ROUTE_PATHS.controlRobots,
        icon: 'robot',
      },
      {
        label: '사이트 관리',
        path: ROUTE_PATHS.controlSites,
        icon: 'map',
      },
      {
        label: '경로·좌표 관리',
        path: ROUTE_PATHS.controlCoordinates,
        icon: 'route',
      },
      {
        label: '이벤트 로그',
        path: ROUTE_PATHS.controlEvents,
        icon: 'events',
      },
      {
        label: '리포트',
        path: ROUTE_PATHS.controlReports,
        icon: 'report',
      },
    ],
  },
  {
    id: 'mlops',
    label: 'MLOps',
    icon: 'mlops',
    homePath: ROUTE_PATHS.mlopsCapture,
    settingsPath: ROUTE_PATHS.mlopsSettings,
    items: [
      {
        id: 'collection',
        label: '수집',
        items: [
          { label: '데이터 수집', path: ROUTE_PATHS.mlopsCapture, icon: 'radio' },
          { label: '수집 세션', path: ROUTE_PATHS.mlopsSessions, icon: 'table' },
          { label: '에피소드', path: ROUTE_PATHS.mlopsEpisodes, icon: 'play' },
          { label: '주행 세션', path: ROUTE_PATHS.mlopsDrives, icon: 'route' },
          { label: '개입 이벤트', path: ROUTE_PATHS.mlopsInterventions, icon: 'intervention' },
        ],
      },
      {
        id: 'data',
        label: '데이터',
        items: [
          { label: '데이터 카탈로그', path: ROUTE_PATHS.mlopsCatalog, icon: 'search' },
          { label: '어노테이션', path: ROUTE_PATHS.mlopsAnnotations, icon: 'table' },
          { label: '품질관리', path: ROUTE_PATHS.mlopsQuality, icon: 'check' },
          { label: '데이터셋', path: ROUTE_PATHS.mlopsDatasets, icon: 'database' },
        ],
      },
    ],
  },
  {
    id: 'bigdata',
    label: 'BigData',
    icon: 'analytics',
    homePath: ROUTE_PATHS.bigdataOverview,
    settingsPath: ROUTE_PATHS.bigdataSettings,
    items: [
      {
        label: '개요',
        path: ROUTE_PATHS.bigdataOverview,
        icon: 'analytics',
      },
      {
        label: '데이터 탐색',
        path: ROUTE_PATHS.bigdataExplorer,
        icon: 'search',
      },
    ],
  },
] as const satisfies readonly MiniAppNavigationItem[];
