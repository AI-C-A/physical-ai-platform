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
    homePath: ROUTE_PATHS.mlopsCollection,
    settingsPath: ROUTE_PATHS.mlopsSettings,
    items: [
      {
        label: '수집',
        path: ROUTE_PATHS.mlopsCollection,
        activePaths: [ROUTE_PATHS.mlopsCapture, ROUTE_PATHS.mlopsSessions],
        icon: 'radio',
      },
      {
        label: '데이터 카탈로그',
        path: ROUTE_PATHS.mlopsCatalog,
        activePaths: [
          ROUTE_PATHS.mlopsEpisodes,
          ROUTE_PATHS.mlopsDrives,
          ROUTE_PATHS.mlopsInterventions,
        ],
        icon: 'search',
      },
      {
        label: '데이터 검수',
        path: ROUTE_PATHS.mlopsReview,
        activePaths: [ROUTE_PATHS.mlopsAnnotations, ROUTE_PATHS.mlopsQuality],
        icon: 'check',
      },
      {
        label: '데이터셋',
        path: ROUTE_PATHS.mlopsDatasets,
        icon: 'database',
      },
      {
        label: '학습',
        path: ROUTE_PATHS.mlopsTraining,
        icon: 'mlops',
      },
      {
        label: '평가',
        path: ROUTE_PATHS.mlopsEvaluations,
        icon: 'report',
      },
      {
        label: '모델 레지스트리',
        path: ROUTE_PATHS.mlopsModels,
        icon: 'robot',
      },
      {
        label: '운영',
        path: ROUTE_PATHS.mlopsOperations,
        activePaths: [ROUTE_PATHS.mlopsDeployments, ROUTE_PATHS.mlopsInference],
        icon: 'activity',
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
      {
        label: '실패·데이터 갭',
        path: ROUTE_PATHS.bigdataFailures,
        icon: 'events',
      },
      {
        label: '계보',
        path: ROUTE_PATHS.bigdataLineage,
        icon: 'mlops',
      },
    ],
  },
] as const satisfies readonly MiniAppNavigationItem[];
