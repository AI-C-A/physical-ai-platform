import type { FlywheelPort } from '@/entities/flywheel';

export const loadProjects = (port: FlywheelPort) => port.listProjects();
export const loadTemplates = (port: FlywheelPort) => port.listTemplates();
export const loadSessions = (port: FlywheelPort) => port.listSessions();
export const loadOperationalSessions = (port: FlywheelPort) => port.listOperationalSessions();
export const loadCollectionOperations = async (port: FlywheelPort) => {
  const [sessions, episodes] = await Promise.all([
    port.listOperationalSessions(),
    port.listEpisodes(),
  ]);
  return { sessions, episodes } as const;
};
export const loadCatalogCollections = (port: FlywheelPort) => port.listCatalogCollections();
export const loadEpisodes = (port: FlywheelPort) => port.listEpisodes();
export const loadDrives = (port: FlywheelPort) => port.listDriveSessions();
export const loadInterventions = (port: FlywheelPort) => port.listInterventions();
export const loadAnnotations = (port: FlywheelPort) => port.listAnnotationTasks();
export const loadQuality = (port: FlywheelPort) => port.listQualityRuns();
export const loadDatasets = (port: FlywheelPort) => port.listDatasets();
export const loadCompute = (port: FlywheelPort) => port.listComputeResources();
export const loadTraining = (port: FlywheelPort) => port.listTrainingRuns();
export const loadEvaluations = (port: FlywheelPort) => port.listEvaluationRuns();
export const loadModels = (port: FlywheelPort) => port.listModelVersions();
export const loadDeployments = (port: FlywheelPort) => port.listDeployments();
export const loadInference = (port: FlywheelPort) => port.listInferenceSessions();
export const loadOverview = (port: FlywheelPort) => port.getOverview();
export const loadFailures = (port: FlywheelPort) => port.listFailureClusters();
export const loadLineage = (port: FlywheelPort) => port.getLineage();
