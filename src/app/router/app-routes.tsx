import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';

import { PageHeader } from '@/shared/ui/page-header';
import { PlatformShell } from '@/widgets/platform-shell';

import { MINI_APP_REGISTRY } from '../config';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { ROUTE_PATHS } from './route-paths';

const FlywheelPages = () => import('@/pages/mlops/flywheel');

const BigDataExplorerPage = lazy(async () => ({
  default: (await import('@/pages/bigdata/explorer')).BigDataExplorerPage,
}));
const BigDataOverviewPage = lazy(async () => ({
  default: (await import('@/pages/bigdata/overview')).BigDataOverviewPage,
}));
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
const CapturePage = lazy(async () => ({ default: (await FlywheelPages()).CaptureHubPage }));
const HumanoidCapturePage = lazy(async () => ({ default: (await FlywheelPages()).HumanoidCapturePage }));
const MobilityCapturePage = lazy(async () => ({ default: (await FlywheelPages()).MobilityCapturePage }));
const CatalogPage = lazy(async () => ({ default: (await FlywheelPages()).CatalogPage }));
const AnnotationsPage = lazy(async () => ({ default: (await FlywheelPages()).AnnotationsPage }));
const AnnotationWorkspacePage = lazy(async () => ({ default: (await FlywheelPages()).AnnotationWorkspacePage }));
const QualityPage = lazy(async () => ({ default: (await FlywheelPages()).QualityPage }));
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
const DeploymentsPage = lazy(async () => ({ default: (await FlywheelPages()).DeploymentsPage }));
const NewDeploymentPage = lazy(async () => ({ default: (await FlywheelPages()).NewDeploymentPage }));
const DeploymentDetailPage = lazy(async () => ({ default: (await FlywheelPages()).DeploymentDetailPage }));
const InferencePage = lazy(async () => ({ default: (await FlywheelPages()).InferencePage }));
const InferenceDetailPage = lazy(async () => ({ default: (await FlywheelPages()).InferenceDetailPage }));
const EpisodesPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelEpisodesPage }));
const EpisodeDetailPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelEpisodeDetailPage }));
const SessionsPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelSessionsPage }));
const SessionDetailPage = lazy(async () => ({ default: (await FlywheelPages()).FlywheelSessionDetailPage }));
const DrivesPage = lazy(async () => ({ default: (await FlywheelPages()).DrivesPage }));
const DriveDetailPage = lazy(async () => ({ default: (await FlywheelPages()).DriveDetailPage }));
const InterventionEventsPage = lazy(async () => ({ default: (await FlywheelPages()).InterventionEventsPage }));
const InterventionDetailPage = lazy(async () => ({ default: (await FlywheelPages()).InterventionDetailPage }));
const SettingsPage = lazy(async () => ({
  default: (await import('@/pages/platform/settings')).SettingsPage,
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
      {
        path: ROUTE_PATHS.controlMonitoring,
        element: <ControlMonitoringPage />,
      },
      {
        path: ROUTE_PATHS.controlMultiRobotMonitoring,
        element: <MultiRobotMonitoringPage />,
      },
      {
        path: ROUTE_PATHS.controlRobotMonitoring,
        element: <RobotMonitoringPage />,
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
      { path: ROUTE_PATHS.mlopsSessions, element: <SessionsPage /> },
      {
        path: ROUTE_PATHS.mlopsSessionDetail,
        element: <SessionDetailPage />,
      },
      { path: ROUTE_PATHS.mlopsCapture, element: <CapturePage /> },
      { path: ROUTE_PATHS.mlopsCaptureHumanoid, element: <HumanoidCapturePage /> },
      { path: ROUTE_PATHS.mlopsCaptureMobility, element: <MobilityCapturePage /> },
      { path: ROUTE_PATHS.mlopsEpisodes, element: <EpisodesPage /> },
      {
        path: ROUTE_PATHS.mlopsEpisodeDetail,
        element: <EpisodeDetailPage />,
      },
      { path: ROUTE_PATHS.mlopsDrives, element: <DrivesPage /> },
      { path: ROUTE_PATHS.mlopsDriveDetail, element: <DriveDetailPage /> },
      { path: ROUTE_PATHS.mlopsInterventions, element: <InterventionEventsPage /> },
      { path: ROUTE_PATHS.mlopsInterventionDetail, element: <InterventionDetailPage /> },
      { path: ROUTE_PATHS.mlopsCatalog, element: <CatalogPage /> },
      { path: ROUTE_PATHS.mlopsAnnotations, element: <AnnotationsPage /> },
      { path: ROUTE_PATHS.mlopsAnnotationDetail, element: <AnnotationWorkspacePage /> },
      { path: ROUTE_PATHS.mlopsQuality, element: <QualityPage /> },
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
      { path: ROUTE_PATHS.mlopsDeployments, element: <DeploymentsPage /> },
      { path: ROUTE_PATHS.mlopsNewDeployment, element: <NewDeploymentPage /> },
      { path: ROUTE_PATHS.mlopsDeploymentDetail, element: <DeploymentDetailPage /> },
      { path: ROUTE_PATHS.mlopsInference, element: <InferencePage /> },
      { path: ROUTE_PATHS.mlopsInferenceDetail, element: <InferenceDetailPage /> },
      { path: ROUTE_PATHS.mlopsSettings, element: <SettingsPage /> },
      {
        path: ROUTE_PATHS.bigdataOverview,
        element: <BigDataOverviewPage />,
      },
      {
        path: ROUTE_PATHS.bigdataExplorer,
        element: <BigDataExplorerPage />,
      },
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
