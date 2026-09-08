import { lazy, type PropsWithChildren } from 'react';
import {
  Navigate,
  useLocation,
  useViewTransitionState,
  type RouteObject,
} from 'react-router-dom';

import { PageHeader } from '@/shared/ui/page-header';
import {
  RouteMorphProvider,
  useRouteMorphTarget,
} from '@/shared/ui/route-morph';
import { PlatformShell } from '@/widgets/platform-shell';

import { MINI_APP_REGISTRY } from '../config';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { ROUTE_PATHS } from './route-paths';

const FlywheelPages = () => import('@/pages/mlops/flywheel');
const CameraCollectorPage = lazy(async () => ({ default: (await import('@/pages/collect/camera')).CameraCollectorPage }));
const QuestCollectorPage = lazy(async () => ({
  default: (await import('@/pages/collect/quest')).QuestCollectorPage,
}));
const BigDataExplorerPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelExplorerPage }));
const FlywheelOverviewPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelOverviewPage }));
const FailuresPage = lazy(async () => ({ default: (await FlywheelPages()).FailuresPage }));
const LineagePage = lazy(async () => ({ default: (await FlywheelPages()).LineagePage }));
const CoordinatesPage = lazy(async () => ({
  default: (await import('@/pages/control/coordinates')).CoordinatesPage,
}));
const EventsPage = lazy(async () => ({
  default: (await import('@/pages/control/events')).EventsPage,
}));
const InterventionsPage = lazy(async () => ({
  default: (await import('@/pages/control/interventions')).InterventionsPage,
}));
const ControlMonitoringPage = lazy(async () => ({
  default: (await import('@/pages/control/monitoring')).ControlMonitoringPage,
}));
const MultiRobotMonitoringPage = lazy(async () => ({
  default: (await import('@/pages/control/monitoring')).MultiRobotMonitoringPage,
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
const CollectionPage = lazy(async () => ({ default: (await FlywheelPages()).CollectionWorkspacePage }));
const NewCollectionPage = lazy(async () => ({ default: (await FlywheelPages()).NewHumanoidCollectionPage }));
const CollectionConnectionPage = lazy(async () => ({ default: (await FlywheelPages()).CollectionConnectionPage }));
const CollectionDetailPage = lazy(async () => ({ default: (await FlywheelPages()).HumanoidCollectionDetailPage }));
const ReviewPage = lazy(async () => ({ default: (await FlywheelPages()).ReviewWorkspacePage }));
const OperationsPage = lazy(async () => ({ default: (await FlywheelPages()).OperationsWorkspacePage }));
const LegacySessionRedirectPage = lazy(async () => ({ default: (await FlywheelPages()).LegacyHumanoidSessionRedirectPage }));
const EpisodeDetailPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelEpisodeDetailPage }));
const DriveDetailPage = lazy(async () => ({ default: (await FlywheelPages()).DriveDetailPage }));
const InterventionDetailPage = lazy(async () => ({ default: (await FlywheelPages()).InterventionDetailPage }));
const CatalogPage = lazy(async () => ({ default: (await FlywheelPages()).CatalogPage }));
const CatalogDetailPage = lazy(async () => ({ default: (await FlywheelPages()).CatalogDetailPage }));
const AnnotationWorkspacePage = lazy(async () => ({ default: (await FlywheelPages()).AnnotationWorkspacePage }));
const QualityDetailPage = lazy(async () => ({ default: (await FlywheelPages()).QualityDetailPage }));
const DatasetsPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelDatasetsPage }));
const NewDatasetPage = lazy(async () => ({ default: (await FlywheelPages()).NewFlywheelDatasetPage }));
const DatasetDetailPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelDatasetDetailPage }));
const TrainingPage = lazy(async () => ({ default: (await FlywheelPages()).TrainingPage }));
const NewTrainingPage = lazy(async () => ({ default: (await FlywheelPages()).NewTrainingPage }));
const TrainingDetailPage = lazy(async () => ({ default: (await FlywheelPages()).TrainingDetailPage }));
const EvaluationsPage = lazy(async () => ({ default: (await FlywheelPages()).EvaluationsPage }));
const NewEvaluationPage = lazy(async () => ({ default: (await FlywheelPages()).NewEvaluationPage }));
const EvaluationDetailPage = lazy(async () => ({ default: (await FlywheelPages()).EvaluationDetailPage }));
const ModelsPage = lazy(async () => ({ default: (await FlywheelPages()).ModelsPage }));
const ModelDetailPage = lazy(async () => ({ default: (await FlywheelPages()).ModelDetailPage }));
const NewDeploymentPage = lazy(async () => ({ default: (await FlywheelPages()).NewDeploymentPage }));
const DeploymentDetailPage = lazy(async () => ({ default: (await FlywheelPages()).DeploymentDetailPage }));
const InferenceDetailPage = lazy(async () => ({ default: (await FlywheelPages()).InferenceDetailPage }));
const SettingsPage = lazy(async () => ({
  default: (await import('@/pages/platform/settings')).SettingsPage,
}));

function LegacyMLOpsRedirect({
  query = {},
  to,
}: {
  readonly query?: Readonly<Record<string, string>>;
  readonly to: string;
}) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  Object.entries(query).forEach(([key, value]) => params.set(key, value));
  const serialized = params.toString();

  return (
    <Navigate
      replace
      to={{
        pathname: to,
        search: serialized === '' ? '' : '?' + serialized,
      }}
    />
  );
}

function MonitoringMorphRoute({ children }: PropsWithChildren) {
  const targetProps = useRouteMorphTarget();

  return (
    <div className="min-h-dvh" {...targetProps}>
      {children}
    </div>
  );
}

function PlatformShellRoute() {
  const transitioning = useViewTransitionState('/*');
  const collectionTransition = useViewTransitionState('/mlops/collection/:sessionId');
  const monitoringTransition = useViewTransitionState('/control/monitoring/:monitorId');

  return (
    <RouteMorphProvider>
      <PlatformShell
        miniApps={MINI_APP_REGISTRY}
        navigationTransition={transitioning && !collectionTransition && !monitoringTransition}
      />
    </RouteMorphProvider>
  );
}

export const APP_ROUTES: RouteObject[] = [
  { path: ROUTE_PATHS.collectCamera, element: <CameraCollectorPage />, errorElement: <RouteErrorBoundary /> },
  {
    path: ROUTE_PATHS.collectQuest,
    element: <QuestCollectorPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: ROUTE_PATHS.root,
    element: <PlatformShellRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate replace to={ROUTE_PATHS.controlMonitoring} />,
      },
      {
        path: ROUTE_PATHS.controlMonitoring,
        element: <ControlMonitoringPage />,
      },
      {
        path: ROUTE_PATHS.controlMultiRobotMonitoring,
        element: (
          <MonitoringMorphRoute>
            <MultiRobotMonitoringPage />
          </MonitoringMorphRoute>
        ),
      },
      {
        path: ROUTE_PATHS.controlRobotMonitoring,
        element: (
          <MonitoringMorphRoute>
            <RobotMonitoringPage />
          </MonitoringMorphRoute>
        ),
      },
      {
        path: ROUTE_PATHS.controlInterventions,
        element: <InterventionsPage />,
      },
      { path: ROUTE_PATHS.controlRobots, element: <RobotsPage /> },
      { path: ROUTE_PATHS.controlSites, element: <SitesPage /> },
      { path: ROUTE_PATHS.controlCoordinates, element: <CoordinatesPage /> },
      { path: ROUTE_PATHS.controlEvents, element: <EventsPage /> },
      { path: ROUTE_PATHS.controlReports, element: <ReportsPage /> },
      {
        path: ROUTE_PATHS.controlSettings,
        element: <SettingsPage showMapStyleSettings />,
      },
      {
        path: ROUTE_PATHS.mlopsCollection,
        element: <CollectionPage />,
        children: [
          { path: 'new', element: <NewCollectionPage /> },
          { path: ':sessionId/setup', element: <CollectionConnectionPage /> },
        ],
      },
      { path: ROUTE_PATHS.mlopsCollectionDetail, element: <CollectionDetailPage /> },
      { path: ROUTE_PATHS.mlopsReview, element: <ReviewPage /> },
      { path: ROUTE_PATHS.mlopsOperations, element: <OperationsPage /> },
      {
        path: ROUTE_PATHS.mlopsSessions,
        element: <LegacyMLOpsRedirect to={ROUTE_PATHS.mlopsCollection} />,
      },
      {
        path: ROUTE_PATHS.mlopsSessionDetail,
        element: <LegacySessionRedirectPage />,
      },
      {
        path: ROUTE_PATHS.mlopsCapture,
        element: <LegacyMLOpsRedirect to={ROUTE_PATHS.mlopsCollection} />,
      },
      {
        path: ROUTE_PATHS.mlopsCaptureHumanoid,
        element: <LegacyMLOpsRedirect to={ROUTE_PATHS.mlopsNewCollection} />,
      },
      {
        path: ROUTE_PATHS.mlopsCaptureMobility,
        element: <LegacyMLOpsRedirect to={ROUTE_PATHS.mlopsCollection} />,
      },
      {
        path: ROUTE_PATHS.mlopsEpisodes,
        element: (
          <LegacyMLOpsRedirect
            query={{ type: 'episode' }}
            to={ROUTE_PATHS.mlopsCatalog}
          />
        ),
      },
      {
        path: ROUTE_PATHS.mlopsEpisodeDetail,
        element: <EpisodeDetailPage />,
      },
      {
        path: ROUTE_PATHS.mlopsDrives,
        element: (
          <LegacyMLOpsRedirect
            query={{ type: 'drive' }}
            to={ROUTE_PATHS.mlopsCatalog}
          />
        ),
      },
      { path: ROUTE_PATHS.mlopsDriveDetail, element: <DriveDetailPage /> },
      {
        path: ROUTE_PATHS.mlopsInterventions,
        element: (
          <LegacyMLOpsRedirect
            query={{ type: 'intervention' }}
            to={ROUTE_PATHS.mlopsCatalog}
          />
        ),
      },
      { path: ROUTE_PATHS.mlopsInterventionDetail, element: <InterventionDetailPage /> },
      { path: ROUTE_PATHS.mlopsCatalog, element: <CatalogPage /> },
      { path: ROUTE_PATHS.mlopsCatalogDetail, element: <CatalogDetailPage /> },
      {
        path: ROUTE_PATHS.mlopsAnnotations,
        element: <LegacyMLOpsRedirect to={ROUTE_PATHS.mlopsReview} />,
      },
      { path: ROUTE_PATHS.mlopsAnnotationDetail, element: <AnnotationWorkspacePage /> },
      {
        path: ROUTE_PATHS.mlopsQuality,
        element: (
          <LegacyMLOpsRedirect
            query={{ view: 'quality' }}
            to={ROUTE_PATHS.mlopsReview}
          />
        ),
      },
      { path: ROUTE_PATHS.mlopsQualityDetail, element: <QualityDetailPage /> },
      { path: ROUTE_PATHS.mlopsDatasets, element: <DatasetsPage /> },
      { path: ROUTE_PATHS.mlopsNewDataset, element: <NewDatasetPage /> },
      {
        path: ROUTE_PATHS.mlopsDatasetDetail,
        element: <DatasetDetailPage />,
      },
      { path: ROUTE_PATHS.mlopsTraining, element: <TrainingPage /> },
      { path: ROUTE_PATHS.mlopsNewTraining, element: <NewTrainingPage /> },
      { path: ROUTE_PATHS.mlopsTrainingDetail, element: <TrainingDetailPage /> },
      { path: ROUTE_PATHS.mlopsEvaluations, element: <EvaluationsPage /> },
      { path: ROUTE_PATHS.mlopsNewEvaluation, element: <NewEvaluationPage /> },
      { path: ROUTE_PATHS.mlopsEvaluationDetail, element: <EvaluationDetailPage /> },
      { path: ROUTE_PATHS.mlopsModels, element: <ModelsPage /> },
      { path: ROUTE_PATHS.mlopsModelDetail, element: <ModelDetailPage /> },
      {
        path: ROUTE_PATHS.mlopsDeployments,
        element: <LegacyMLOpsRedirect to={ROUTE_PATHS.mlopsOperations} />,
      },
      { path: ROUTE_PATHS.mlopsNewDeployment, element: <NewDeploymentPage /> },
      { path: ROUTE_PATHS.mlopsDeploymentDetail, element: <DeploymentDetailPage /> },
      {
        path: ROUTE_PATHS.mlopsInference,
        element: (
          <LegacyMLOpsRedirect
            query={{ view: 'inference' }}
            to={ROUTE_PATHS.mlopsOperations}
          />
        ),
      },
      { path: ROUTE_PATHS.mlopsInferenceDetail, element: <InferenceDetailPage /> },
      { path: ROUTE_PATHS.mlopsSettings, element: <SettingsPage /> },
      {
        path: ROUTE_PATHS.bigdataOverview,
        element: <FlywheelOverviewPage />,
      },
      {
        path: ROUTE_PATHS.bigdataExplorer,
        element: <BigDataExplorerPage />,
      },
      { path: ROUTE_PATHS.bigdataFailures, element: <FailuresPage /> },
      { path: ROUTE_PATHS.bigdataLineage, element: <LineagePage /> },
      { path: ROUTE_PATHS.bigdataSettings, element: <SettingsPage /> },
      {
        path: '*',
        element: (
          <PageHeader
            eyebrow="404"
            title="페이지를 찾을 수 없습니다"
          />
        ),
      },
    ],
  },
];
