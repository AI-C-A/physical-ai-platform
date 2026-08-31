import type { ExecutionProvenance } from '@/shared/domain';

export type RobotType = 'humanoid' | 'quadruped' | 'mobile';
export type CollectionKind = 'humanoid' | 'mobility';
export type DataUnitKind =
  | 'humanoid-episode'
  | 'drive-window'
  | 'intervention-window';
export type ReviewStatus =
  | 'unassigned'
  | 'assigned'
  | 'in-progress'
  | 'review'
  | 'approved'
  | 'rejected';
export type QualityStatus = 'pending' | 'passed' | 'failed' | 'quarantined';

export interface ProjectDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
}

export interface FlywheelStream {
  readonly id: string;
  readonly displayName: string;
  readonly expectedRateHz: number | null;
  readonly observedRateHz: number | null;
  readonly bytesWritten: number;
  readonly status: 'waiting' | 'active' | 'stopped' | 'stale';
}

export interface CollectionTemplate {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly kind: CollectionKind;
  readonly robotType: RobotType;
  readonly streamIds: readonly string[];
  readonly syncToleranceMs: number;
  readonly preBufferMs: number;
  readonly postBufferMs: number;
}

export type FlywheelCaptureStatus =
  | 'draft'
  | 'validating'
  | 'ready'
  | 'recording'
  | 'processing'
  | 'completed'
  | 'failed';

interface CaptureSessionBase {
  readonly id: string;
  readonly projectId: string;
  readonly siteId: string;
  readonly name: string;
  readonly kind: CollectionKind;
  readonly robotId: string;
  readonly robotType: RobotType;
  readonly sensorDeviceId: string;
  readonly provenance: ExecutionProvenance;
  readonly status: FlywheelCaptureStatus;
  readonly createdAtMs: number;
  readonly startedAtMs: number | null;
  readonly stoppedAtMs: number | null;
  readonly bytesWritten: number;
  readonly streams: readonly FlywheelStream[];
  readonly preflight: readonly FlywheelPreflightCheck[];
}

export interface HumanoidCaptureSession extends CaptureSessionBase {
  readonly kind: 'humanoid';
  readonly taskId: string;
  readonly instruction: string;
  readonly episodeIds: readonly string[];
  readonly activeEpisodeId: string | null;
}

export interface MobilityCaptureSession extends CaptureSessionBase {
  readonly kind: 'mobility';
  readonly routeId: string;
  readonly driveSessionId: string | null;
  readonly interventionIds: readonly string[];
  readonly chunkPolicy: {
    readonly durationMs: number;
    readonly preBufferMs: number;
    readonly postBufferMs: number;
  };
  readonly controlMode: 'autonomous' | 'teleop' | 'manual';
}

export type FlywheelCaptureSession =
  | HumanoidCaptureSession
  | MobilityCaptureSession;

export interface FlywheelPreflightCheck {
  readonly id: string;
  readonly label: string;
  readonly state: 'passed' | 'failed';
  readonly detail: string;
}

export interface EpisodeEvent {
  readonly id: string;
  readonly occurredAtMs: number;
  readonly type: 'contact' | 'grasp' | 'release' | 'collision' | 'recovery' | 'subtask';
  readonly label: string;
}

export interface FlywheelEpisode {
  readonly id: string;
  readonly projectId: string;
  readonly siteId: string;
  readonly captureSessionId: string;
  readonly name: string;
  readonly taskId: string;
  readonly instruction: string;
  readonly robotId: string;
  readonly sensorDeviceId: string;
  readonly provenance: ExecutionProvenance;
  readonly status: 'recording' | 'processing' | 'completed' | 'invalid';
  readonly outcome: 'success' | 'failure' | 'aborted' | null;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
  readonly bytesWritten: number;
  readonly annotationStatus: ReviewStatus;
  readonly qualityStatus: QualityStatus;
  readonly events: readonly EpisodeEvent[];
  readonly streams: readonly FlywheelStream[];
}

export interface RecordingChunk {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly bytesWritten: number;
}

export interface DriveSession {
  readonly id: string;
  readonly projectId: string;
  readonly siteId: string;
  readonly captureSessionId: string;
  readonly robotId: string;
  readonly routeId: string;
  readonly status: 'recording' | 'processing' | 'completed' | 'failed';
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
  readonly durationMs: number;
  readonly distanceMeters: number;
  readonly autonomyRatio: number;
  readonly chunks: readonly RecordingChunk[];
  readonly interventionIds: readonly string[];
  readonly qualityStatus: QualityStatus;
}

export interface InterventionEvent {
  readonly id: string;
  readonly projectId: string;
  readonly siteId: string;
  readonly driveSessionId: string;
  readonly robotId: string;
  readonly status: 'detected' | 'needs-review' | 'reviewed' | 'approved' | 'rejected';
  readonly trigger: 'control-transition' | 'operator-request' | 'safety-stop';
  readonly startMs: number;
  readonly controlReturnedAtMs: number | null;
  readonly endMs: number | null;
  readonly reason:
    | 'obstacle'
    | 'localization'
    | 'planning'
    | 'perception'
    | 'safety'
    | 'unknown';
  readonly severity: 'low' | 'medium' | 'high';
  readonly outcome: 'recovered' | 'stopped' | 'rerouted' | 'pending';
  readonly note: string;
  readonly qualityStatus: QualityStatus;
}

export interface AnnotationTask {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly dataKind: DataUnitKind;
  readonly schemaName: string;
  readonly assignee: string;
  readonly reviewer: string;
  readonly status: ReviewStatus;
  readonly totalItems: number;
  readonly completedItems: number;
  readonly description: string;
}

export interface QualityRuleSet {
  readonly id: string;
  readonly name: string;
  readonly requiredStreams: readonly string[];
  readonly minimumRateHz: number;
  readonly maximumDriftMs: number;
  readonly maximumDropPercent: number;
  readonly minimumDurationMs: number;
  readonly requireAnnotation: boolean;
}

export interface QualityRun {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly ruleSetId: string;
  readonly dataKind: DataUnitKind;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly passedItems: number;
  readonly failedItems: number;
  readonly quarantinedItems: number;
  readonly issues: readonly string[];
  readonly createdAtMs: number;
}

export type DatasetUnitRef =
  | { readonly kind: 'episode'; readonly episodeId: string }
  | {
      readonly kind: 'drive-window';
      readonly driveSessionId: string;
      readonly startMs: number;
      readonly endMs: number;
    }
  | {
      readonly kind: 'intervention-window';
      readonly interventionId: string;
      readonly preMs: number;
      readonly postMs: number;
    };

export interface DatasetVersion {
  readonly id: string;
  readonly familyId: string;
  readonly projectId: string;
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly tags: readonly string[];
  readonly kind: DataUnitKind;
  readonly status: 'draft' | 'validating' | 'ready' | 'released' | 'archived';
  readonly unitRefs: readonly DatasetUnitRef[];
  readonly split: { readonly train: number; readonly validation: number; readonly test: number };
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly validation: readonly string[];
}

export type ModelFamily = 'pi0' | 'pi05' | 'act' | 'custom';

export interface ComputeResource {
  readonly id: string;
  readonly displayName: string;
  readonly modelName: string;
  readonly memoryTotalMb: number;
  readonly memoryUsedMb: number;
  readonly utilizationPercent: number;
  readonly status: 'idle' | 'medium' | 'busy';
}

export interface TrainingMetric {
  readonly step: number;
  readonly loss: number;
  readonly throughput: number;
}

export interface TrainingRun {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly datasetVersionId: string;
  readonly modelFamily: ModelFamily;
  readonly computeResourceIds: readonly string[];
  readonly status: 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  readonly batchSize: number;
  readonly steps: number;
  readonly learningRate: number;
  readonly currentStep: number;
  readonly metrics: readonly TrainingMetric[];
  readonly logs: readonly string[];
  readonly checkpoints: readonly string[];
  readonly createdAtMs: number;
  readonly modelVersionId: string | null;
}

export interface EvaluationRun {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly modelVersionId: string;
  readonly baselineModelVersionId: string | null;
  readonly robotType: RobotType;
  readonly environment: 'physical' | 'simulation' | 'replay';
  readonly scenario: string;
  readonly repetitions: number;
  readonly passThreshold: number;
  readonly status: 'draft' | 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  readonly score: number | null;
  readonly metrics: readonly { readonly label: string; readonly value: number; readonly unit: string }[];
  readonly createdAtMs: number;
}

export interface ModelVersion {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly version: number;
  readonly modelFamily: ModelFamily;
  readonly robotType: RobotType;
  readonly stage: 'candidate' | 'staging' | 'production' | 'archived';
  readonly trainingRunId: string;
  readonly datasetVersionId: string;
  readonly evaluationRunIds: readonly string[];
  readonly artifactSizeBytes: number;
  readonly createdAtMs: number;
}

export interface Deployment {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly modelVersionId: string;
  readonly robotIds: readonly string[];
  readonly status: 'draft' | 'deploying' | 'active' | 'partial' | 'failed' | 'rolling-back' | 'rolled-back';
  readonly runtime: string;
  readonly controlFrequencyHz: number;
  readonly rolloutPercent: number;
  readonly latencyMs: number | null;
  readonly actionRateHz: number | null;
  readonly createdAtMs: number;
}

export interface InferenceSession {
  readonly id: string;
  readonly projectId: string;
  readonly deploymentId: string;
  readonly modelVersionId: string;
  readonly robotId: string;
  readonly task: string;
  readonly status: 'running' | 'completed' | 'failed';
  readonly outcome: 'success' | 'failure' | 'intervention' | null;
  readonly averageLatencyMs: number;
  readonly actionRateHz: number;
  readonly interventionId: string | null;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
  readonly steps: readonly {
    readonly timestampMs: number;
    readonly prompt: string;
    readonly action: string;
    readonly confidence: number;
  }[];
}

export interface FailureCluster {
  readonly id: string;
  readonly title: string;
  readonly cause: string;
  readonly count: number;
  readonly severity: 'low' | 'medium' | 'high';
  readonly affectedRobotType: RobotType;
  readonly recommendedCollectionCount: number;
  readonly relatedInferenceIds: readonly string[];
}

export interface LineageNode {
  readonly id: string;
  readonly type:
    | 'capture'
    | 'episode'
    | 'drive'
    | 'intervention'
    | 'dataset'
    | 'training'
    | 'model'
    | 'evaluation'
    | 'deployment'
    | 'inference';
  readonly label: string;
  readonly detailPath: string;
  readonly status: string;
}

export interface LineageEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
}

export interface FlywheelOverview {
  readonly episodeCount: number;
  readonly driveHours: number;
  readonly validDataPercent: number;
  readonly taskSuccessPercent: number;
  readonly autonomyPercent: number;
  readonly interventionsPerKm: number;
  readonly releasedDatasetCount: number;
  readonly activeDeploymentCount: number;
}

export interface CreateHumanoidSessionInput {
  readonly projectId: string;
  readonly siteId: string;
  readonly name: string;
  readonly robotId: string;
  readonly sensorDeviceId: string;
  readonly taskId: string;
  readonly instruction: string;
}

export interface CreateMobilitySessionInput {
  readonly projectId: string;
  readonly siteId: string;
  readonly name: string;
  readonly robotId: string;
  readonly sensorDeviceId: string;
  readonly routeId: string;
  readonly preBufferMs: number;
  readonly postBufferMs: number;
}

export interface CreateDatasetVersionInput {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly kind: DataUnitKind;
  readonly tags: readonly string[];
  readonly unitRefs: readonly DatasetUnitRef[];
}

export interface CreateTrainingRunInput {
  readonly projectId: string;
  readonly name: string;
  readonly datasetVersionId: string;
  readonly modelFamily: ModelFamily;
  readonly computeResourceIds: readonly string[];
  readonly batchSize: number;
  readonly steps: number;
  readonly learningRate: number;
}

export interface CreateEvaluationRunInput {
  readonly projectId: string;
  readonly name: string;
  readonly modelVersionId: string;
  readonly robotType: RobotType;
  readonly environment: EvaluationRun['environment'];
  readonly scenario: string;
  readonly repetitions: number;
  readonly passThreshold: number;
}

export interface CreateDeploymentInput {
  readonly projectId: string;
  readonly name: string;
  readonly modelVersionId: string;
  readonly robotIds: readonly string[];
  readonly runtime: string;
  readonly controlFrequencyHz: number;
  readonly rolloutPercent: number;
}

export interface FlywheelPort {
  listProjects(): Promise<readonly ProjectDescriptor[]>;
  listTemplates(): Promise<readonly CollectionTemplate[]>;
  listSessions(): Promise<readonly FlywheelCaptureSession[]>;
  getSession(id: string): Promise<FlywheelCaptureSession | null>;
  createHumanoidSession(input: CreateHumanoidSessionInput): Promise<HumanoidCaptureSession>;
  createMobilitySession(input: CreateMobilitySessionInput): Promise<MobilityCaptureSession>;
  validateSession(id: string): Promise<FlywheelCaptureSession>;
  startSession(id: string): Promise<FlywheelCaptureSession>;
  stopSession(id: string): Promise<FlywheelCaptureSession>;
  startEpisode(sessionId: string, name: string): Promise<FlywheelEpisode>;
  completeEpisode(episodeId: string, outcome: 'success' | 'failure' | 'aborted'): Promise<FlywheelEpisode>;
  setMobilityControlMode(sessionId: string, mode: MobilityCaptureSession['controlMode']): Promise<MobilityCaptureSession>;
  listEpisodes(): Promise<readonly FlywheelEpisode[]>;
  getEpisode(id: string): Promise<FlywheelEpisode | null>;
  listDriveSessions(): Promise<readonly DriveSession[]>;
  getDriveSession(id: string): Promise<DriveSession | null>;
  listInterventions(): Promise<readonly InterventionEvent[]>;
  getIntervention(id: string): Promise<InterventionEvent | null>;
  updateIntervention(id: string, input: Pick<InterventionEvent, 'startMs' | 'endMs' | 'reason' | 'severity' | 'outcome' | 'note'>): Promise<InterventionEvent>;
  listAnnotationTasks(): Promise<readonly AnnotationTask[]>;
  createAnnotationTask(input: Omit<AnnotationTask, 'id' | 'status' | 'completedItems'>): Promise<AnnotationTask>;
  updateAnnotationTask(id: string, input: Pick<AnnotationTask, 'description' | 'status' | 'completedItems'>): Promise<AnnotationTask>;
  listQualityRuns(): Promise<readonly QualityRun[]>;
  getQualityRun(id: string): Promise<QualityRun | null>;
  runQualityCheck(dataKind: DataUnitKind): Promise<QualityRun>;
  listDatasets(): Promise<readonly DatasetVersion[]>;
  getDataset(id: string): Promise<DatasetVersion | null>;
  createDataset(input: CreateDatasetVersionInput): Promise<DatasetVersion>;
  releaseDataset(id: string): Promise<DatasetVersion>;
  listComputeResources(): Promise<readonly ComputeResource[]>;
  listTrainingRuns(): Promise<readonly TrainingRun[]>;
  getTrainingRun(id: string): Promise<TrainingRun | null>;
  createTrainingRun(input: CreateTrainingRunInput): Promise<TrainingRun>;
  cancelTrainingRun(id: string): Promise<TrainingRun>;
  listEvaluationRuns(): Promise<readonly EvaluationRun[]>;
  getEvaluationRun(id: string): Promise<EvaluationRun | null>;
  createEvaluationRun(input: CreateEvaluationRunInput): Promise<EvaluationRun>;
  listModelVersions(): Promise<readonly ModelVersion[]>;
  getModelVersion(id: string): Promise<ModelVersion | null>;
  updateModelStage(id: string, stage: ModelVersion['stage']): Promise<ModelVersion>;
  listDeployments(): Promise<readonly Deployment[]>;
  getDeployment(id: string): Promise<Deployment | null>;
  createDeployment(input: CreateDeploymentInput): Promise<Deployment>;
  rollbackDeployment(id: string): Promise<Deployment>;
  listInferenceSessions(): Promise<readonly InferenceSession[]>;
  getInferenceSession(id: string): Promise<InferenceSession | null>;
  getOverview(): Promise<FlywheelOverview>;
  listFailureClusters(): Promise<readonly FailureCluster[]>;
  getLineage(): Promise<{ readonly nodes: readonly LineageNode[]; readonly edges: readonly LineageEdge[] }>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
