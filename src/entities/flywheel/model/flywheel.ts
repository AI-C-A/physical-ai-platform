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
  readonly origin?: CollectionStreamOrigin;
  readonly sourceDeviceId?: string | null;
  readonly coordinateFrame?: string | null;
  readonly processingStatus?: DerivedArtifactProcessingState | null;
}

export type CollectionTelemetryConnectionState = 'live' | 'stale' | 'offline';
export type CollectionTelemetryHealth = 'healthy' | 'degraded' | 'disconnected';
export type CollectionTelemetrySyncState = 'aligned' | 'warning' | 'out-of-sync' | 'unavailable';
export type CollectionTelemetryQualityVerdict = 'training-ready' | 'review' | 'not-ready';
export type CollectionTelemetryModality =
  | 'rgb'
  | 'depth'
  | 'hand-pose'
  | 'robot-state'
  | 'exoskeleton-state'
  | 'action'
  | 'semantic'
  | 'estimated-depth';
export type CollectionTimelineAnomalyKind = 'drop' | 'missing' | 'drift';

export type CollectionStreamOrigin = 'sensor' | 'state' | 'control' | 'derived';
export type HumanDemonstrationSourceRole =
  | 'xr-hand-tracking'
  | 'head-camera'
  | 'exoskeleton'
  | 'external-scene-camera';
export type HumanDemonstrationSourceState =
  | 'pending'
  | 'paired'
  | 'ready'
  | 'recording'
  | 'stale'
  | 'offline'
  | 'error';
export type CollectorEpisodeCommand = 'start' | 'stop';
export type CollectorAcknowledgementState = 'pending' | 'acknowledged' | 'rejected';
export type DerivedArtifactProcessingState =
  | 'disabled'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface HumanDemonstrationStreamPolicy {
  readonly streamId: string;
  readonly displayName: string;
  readonly modality: CollectionTelemetryModality;
  readonly origin: CollectionStreamOrigin;
  readonly sourceRole: HumanDemonstrationSourceRole | null;
  readonly required: boolean;
  readonly targetRateHz: number | null;
  readonly coordinateFrame: string | null;
  readonly maximumDriftMs: number | null;
  readonly minimumCompletenessPercent: number | null;
}

/**
 * 장치나 화면이 임계치를 따로 결정하지 않도록 Session에 고정되는 수집 정책이다.
 * 기본값은 Mock 검증용이며 production profile을 확정하는 계약 지점으로 사용한다.
 */
export interface HumanDemonstrationProfile {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly handTracking: {
    readonly requiredHands: 'both' | 'at-least-one';
    readonly targetRateHz: number;
    readonly queueCapacityFrames: number;
    readonly maximumBatchFrames: number;
    readonly flushIntervalMs: number;
    readonly partialAfterMs: number;
    readonly lostAfterMs: number;
  };
  readonly streams: readonly HumanDemonstrationStreamPolicy[];
}

export interface HumanDemonstrationSourceBinding {
  readonly sourceDeviceId: string;
  readonly role: HumanDemonstrationSourceRole;
  readonly integrationProfileId: string;
  readonly required: boolean;
  readonly state: HumanDemonstrationSourceState;
  readonly capabilities: readonly string[];
  readonly lastSeenAtMs: number | null;
  readonly activeEpisodeId: string | null;
}

export interface CollectorAcknowledgement {
  readonly sessionId: string;
  readonly episodeId: string;
  readonly sourceDeviceId: string;
  readonly command: CollectorEpisodeCommand;
  readonly state: CollectorAcknowledgementState;
  readonly acknowledgedAtMs: number | null;
  readonly detail: string | null;
}

export interface HumanDemonstrationBinding {
  /** Session 범위에서만 의미가 있는 가명 participant 식별자다. */
  readonly participantId: string;
  readonly participantIdScope: 'session';
  readonly exoskeletonDeviceId: string;
  readonly profile: HumanDemonstrationProfile;
  readonly sourceBindings: readonly HumanDemonstrationSourceBinding[];
  readonly collectorAcknowledgements: readonly CollectorAcknowledgement[];
  readonly pairing: {
    readonly code: string;
    readonly expiresAtMs: number | null;
  };
}

export interface CollectionTelemetryIssue {
  readonly id: string;
  readonly severity: 'warning' | 'critical';
  readonly streamId: string | null;
  readonly message: string;
}

export type CollectionOperationalState =
  | 'configuring'
  | 'pairing'
  | 'preflight-blocked'
  | 'ready'
  | 'recording'
  | 'degraded'
  | 'disconnected'
  | 'finalizing'
  | 'review'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'abandoned'
  | 'conflict';

export type CollectionCommand =
  | 'run-preflight'
  | 'start-episode'
  | 'stop-episode'
  | 'save-episode'
  | 'retake-episode'
  | 'retry-finalization'
  | 'retry-processing'
  | 'finish-session';

export interface CollectionCapabilities {
  readonly commands: Readonly<Record<CollectionCommand, {
    readonly available: boolean;
    readonly unavailableReason: string | null;
  }>>;
  readonly writerTelemetryAvailable: boolean;
  readonly storageTelemetryAvailable: boolean;
}

export interface CollectionReadiness {
  readonly ready: boolean;
  readonly requiredSourceCount: number;
  readonly readyRequiredSourceCount: number;
  readonly blockingIssueIds: readonly string[];
}

export interface CollectionIssue {
  readonly id: string;
  readonly targetId: string | null;
  readonly severity: 'warning' | 'critical';
  readonly message: string;
  readonly impact: string;
  readonly occurredAtMs: number | null;
  readonly suggestedCommand: CollectionCommand | null;
}

export interface CollectionSourceHealth {
  readonly streamId: string;
  readonly required: boolean;
  readonly origin: CollectionStreamOrigin;
  readonly state: HumanDemonstrationSourceState | 'disabled';
  readonly observedRateHz: number | null;
  readonly targetRateHz: number | null;
  readonly lastSampleAtMs: number | null;
  readonly droppedSampleCount: number;
}

export interface CollectionWriterHealth {
  readonly state: 'idle' | 'writing' | 'backpressure' | 'draining' | 'committed' | 'failed';
  readonly persistedBytes: number | null;
  readonly lastCommitAtMs: number | null;
  readonly safeToLeave: boolean;
}

export interface CollectionStreamTelemetry {
  readonly streamId: string;
  readonly displayName: string;
  readonly modality: CollectionTelemetryModality;
  readonly required: boolean;
  readonly health: CollectionTelemetryHealth;
  readonly connectionState: CollectionTelemetryConnectionState;
  readonly expectedRateHz: number | null;
  readonly observedRateHz: number | null;
  readonly latencyMs: number | null;
  readonly driftMs: number | null;
  readonly sampleCount: number;
  readonly droppedFrameCount: number;
  readonly missingSampleCount: number;
  readonly bytesWritten: number;
  readonly lastSampleAtMs: number | null;
  readonly origin?: CollectionStreamOrigin;
  readonly sourceDeviceId?: string | null;
  readonly coordinateFrame?: string | null;
  readonly processingStatus?: DerivedArtifactProcessingState | null;
  readonly handTracking?: {
    /** WebXR 원시 보장이 아니라 profile의 시간 정책으로 계산한 품질 상태다. */
    readonly qualityState: 'tracking' | 'partial' | 'lost';
    readonly poseObserved: boolean;
    readonly sourcePresent: boolean;
    readonly consecutiveMissingMs: number;
    readonly validJointCount: 0 | 25;
  } | null;
}

export interface CollectionTimelineAnomaly {
  /** Offset from the snapshot observation time. The recent window uses -10_000 through 0. */
  readonly startOffsetMs: number;
  readonly endOffsetMs: number;
  readonly kind: CollectionTimelineAnomalyKind;
  readonly severity: 'warning' | 'critical';
  readonly label: string;
}

export interface CollectionTimelineTrack {
  readonly streamId: string;
  readonly label: string;
  readonly health: CollectionTelemetryHealth;
  readonly anomalies: readonly CollectionTimelineAnomaly[];
}

export interface CollectionSpatialTelemetry {
  readonly coordinateFrame: string;
  readonly positionMeters: readonly [number, number, number];
  readonly orientationRpyDegrees: readonly [number, number, number];
  readonly poseRateHz: number | null;
  readonly pointCloud: {
    readonly available: boolean;
    readonly pointCount: number | null;
    readonly lastFrameAtMs: number | null;
  };
}

export interface CollectionHandJointPose {
  readonly name: string;
  readonly positionMeters: readonly [number, number, number];
  readonly orientationQuaternion: readonly [number, number, number, number];
  readonly radiusMeters: number | null;
}

export interface CollectionHandPoseObservation {
  readonly sourcePresent: boolean;
  readonly poseObserved: boolean;
  readonly joints: readonly CollectionHandJointPose[];
}

/** Latest raw Quest pose used only for live/replay visualization. */
export interface CollectionHandPoseTelemetry {
  readonly coordinateFrame: 'quest-local-floor';
  readonly deviceTimestampMs: number;
  readonly receivedTimestampMs: number;
  readonly hands: Readonly<Record<'left' | 'right', CollectionHandPoseObservation>>;
}

/** A raw Quest pose retained on the Episode timeline for exact replay. */
export interface CollectionHandPoseFrame extends CollectionHandPoseTelemetry {
  readonly sequence: number;
  readonly frameEpoch: number;
  readonly episodeOffsetMs: number;
}

/** 외부 전신 추적 결과. Quest 손 좌표와 보정 없이 합치지 않는다. */
export interface CollectionBodyPoseTelemetry {
  readonly coordinateFrame: string;
  readonly sourceStreamId: string;
  readonly receivedTimestampMs: number;
  readonly joints: readonly {
    readonly name: string;
    readonly positionMeters: readonly [number, number, number];
  }[];
}

/** 같은 Head RGB 프레임에서 생성된 표시용 결과. 상대 깊이에 거리 단위를 부여하지 않는다. */
export interface CollectionHeadPerception {
  readonly sourceStreamId: string;
  readonly receivedTimestampMs: number;
  readonly depthImageUrl: string;
  readonly segmentationMaskUrl: string;
  readonly depthKind: 'metric' | 'relative';
  readonly labels: readonly string[];
}

export interface CollectionTelemetrySnapshot {
  readonly sessionId: string;
  readonly activeEpisodeId: string | null;
  readonly observedAtMs: number;
  readonly freshness: {
    readonly staleAfterMs: number;
    readonly offlineAfterMs: number;
  };
  readonly connectionState: CollectionTelemetryConnectionState;
  readonly elapsedMs: number;
  readonly totalSampleCount: number;
  readonly bytesWritten: number;
  readonly completenessPercent: number;
  readonly qualityVerdict: CollectionTelemetryQualityVerdict;
  readonly qualityIssues: readonly CollectionTelemetryIssue[];
  readonly sync: {
    readonly state: CollectionTelemetrySyncState;
    readonly toleranceMs: number;
    readonly maxDriftMs: number | null;
  };
  readonly streams: readonly CollectionStreamTelemetry[];
  readonly timeline: {
    readonly windowMs: number;
    readonly tracks: readonly CollectionTimelineTrack[];
  };
  readonly spatial: CollectionSpatialTelemetry | null;
  readonly handPose: CollectionHandPoseTelemetry | null;
  readonly bodyPose?: CollectionBodyPoseTelemetry | null;
  readonly headPerception?: CollectionHeadPerception | null;
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
  | 'active'
  | 'recording'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'abandoned';

interface CaptureSessionBase {
  readonly id: string;
  readonly projectId: string;
  readonly siteId: string;
  readonly name: string;
  readonly kind: CollectionKind;
  readonly robotId: string | null;
  readonly robotType: RobotType | null;
  readonly sensorDeviceId: string | null;
  readonly provenance: ExecutionProvenance;
  readonly status: FlywheelCaptureStatus;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
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
  readonly sensorPresetId: string;
  readonly episodeIds: readonly string[];
  readonly activeEpisodeId: string | null;
  readonly processingStage: 'finalizing-files' | 'indexing' | null;
  readonly errorMessage: string | null;
  readonly humanDemonstration: HumanDemonstrationBinding | null;
}

export interface MobilityCaptureSession extends CaptureSessionBase {
  readonly kind: 'mobility';
  readonly robotId: string;
  readonly robotType: 'quadruped' | 'mobile';
  readonly sensorDeviceId: string;
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
  readonly state: 'passed' | 'warning' | 'failed';
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
  readonly robotId: string | null;
  readonly sensorDeviceId: string | null;
  readonly humanDemonstration: HumanDemonstrationBinding | null;
  readonly provenance: ExecutionProvenance;
  readonly status: 'recording' | 'finalizing' | 'processing' | 'completed' | 'invalid';
  readonly outcome: 'success' | 'failure' | 'aborted' | null;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
  readonly bytesWritten: number;
  readonly annotationStatus: ReviewStatus;
  readonly qualityStatus: QualityStatus;
  readonly qualityWarnings: readonly string[];
  readonly finalizationError: string | null;
  readonly events: readonly EpisodeEvent[];
  readonly streams: readonly FlywheelStream[];
}

export interface CatalogCollection {
  readonly id: string;
  readonly projectId: string;
  readonly siteId: string;
  readonly name: string;
  readonly robotId: string | null;
  readonly participantId: string | null;
  readonly taskId: string;
  readonly instruction: string;
  readonly completedAtMs: number;
  readonly episodeIds: readonly string[];
  readonly qualityStatus: QualityStatus;
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
  readonly sensorPresetId?: string;
  readonly taskId: string;
  readonly instruction: string;
}

export interface CreateHumanDemonstrationSessionInput {
  readonly projectId: string;
  readonly siteId: string;
  readonly name: string;
  readonly taskId: string;
  readonly instruction: string;
  readonly exoskeletonDeviceId: string;
  readonly questDeviceId: string;
  readonly headCameraDeviceId: string;
  readonly externalCameraDeviceId: string;
  readonly profileId?: string;
}

export interface PairHumanDemonstrationSourceInput {
  readonly pairingCode: string;
  readonly sourceDeviceId: string;
  readonly integrationProfileId: string;
  readonly capabilities: readonly string[];
}

export interface HumanDemonstrationPairingResult {
  readonly sessionId: string;
  readonly sourceDeviceId: string;
  readonly participantId: string;
  readonly profile: HumanDemonstrationProfile;
  readonly activeEpisodeId: string | null;
}

export interface HandPoseBatchReceiptInput {
  readonly sessionId: string;
  readonly episodeId: string;
  readonly sourceDeviceId: string;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly frameCount: number;
  readonly byteLength: number;
  readonly deviceTimestampMs: number;
  readonly receivedTimestampMs: number;
  readonly leftPoseObserved: boolean;
  readonly rightPoseObserved: boolean;
  readonly leftSourcePresent: boolean;
  readonly rightSourcePresent: boolean;
  readonly latestHandPose: CollectionHandPoseTelemetry;
  readonly frames: readonly CollectionHandPoseFrame[];
}

export interface HandPosePreviewInput {
  readonly sessionId: string;
  readonly sourceDeviceId: string;
  readonly deviceTimestampMs: number;
  readonly receivedTimestampMs: number;
  readonly coordinateFrame: 'quest-local-floor';
  readonly hands: CollectionHandPoseTelemetry['hands'];
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
  readonly collectionMode?: 'quest-hands';
  listProjects(): Promise<readonly ProjectDescriptor[]>;
  listTemplates(): Promise<readonly CollectionTemplate[]>;
  listSessions(): Promise<readonly FlywheelCaptureSession[]>;
  listOperationalSessions(): Promise<readonly HumanoidCaptureSession[]>;
  deleteOperationalSession(sessionId: string): Promise<void>;
  getSession(id: string): Promise<FlywheelCaptureSession | null>;
  getCollectionTelemetry(sessionId: string): Promise<CollectionTelemetrySnapshot | null>;
  getEpisodeHandPoseAt(
    episodeId: string,
    offsetMs: number,
  ): Promise<CollectionHandPoseFrame | null>;
  subscribeCollectionTelemetry?(
    sessionId: string,
    listener: () => void,
  ): () => void;
  createHumanoidSession(input: CreateHumanoidSessionInput): Promise<HumanoidCaptureSession>;
  createHumanDemonstrationSession(
    input: CreateHumanDemonstrationSessionInput,
  ): Promise<HumanoidCaptureSession>;
  pairHumanDemonstrationSource(
    input: PairHumanDemonstrationSourceInput,
  ): Promise<HumanDemonstrationPairingResult>;
  renewHumanDemonstrationPairing(sessionId: string): Promise<HumanoidCaptureSession>;
  updateHumanDemonstrationSource(
    sessionId: string,
    sourceDeviceId: string,
    state: HumanDemonstrationSourceState,
  ): Promise<HumanoidCaptureSession>;
  acknowledgeCollectorCommand(
    acknowledgement: CollectorAcknowledgement,
  ): Promise<HumanoidCaptureSession>;
  reportHandPoseBatch(input: HandPoseBatchReceiptInput): Promise<void>;
  reportHandPosePreview(input: HandPosePreviewInput): Promise<void>;
  createMobilitySession(input: CreateMobilitySessionInput): Promise<MobilityCaptureSession>;
  validateSession(id: string): Promise<FlywheelCaptureSession>;
  startSession(id: string): Promise<FlywheelCaptureSession>;
  stopSession(id: string): Promise<FlywheelCaptureSession>;
  startEpisode(sessionId: string, name?: string): Promise<FlywheelEpisode>;
  stopEpisode(episodeId: string): Promise<FlywheelEpisode>;
  saveEpisode(episodeId: string): Promise<FlywheelEpisode>;
  deleteEpisode(episodeId: string): Promise<void>;
  setEpisodeOutcome(episodeId: string, outcome: 'success' | 'failure'): Promise<FlywheelEpisode>;
  retryEpisodeFinalization(episodeId: string): Promise<FlywheelEpisode>;
  invalidateEpisode(episodeId: string): Promise<FlywheelEpisode>;
  completeEpisode(episodeId: string, outcome: 'success' | 'failure' | 'aborted'): Promise<FlywheelEpisode>;
  retrySessionProcessing(sessionId: string): Promise<HumanoidCaptureSession>;
  abandonSession(sessionId: string): Promise<HumanoidCaptureSession>;
  reportStreamFailure(sessionId: string, streamId: string, required: boolean): Promise<HumanoidCaptureSession>;
  listCatalogCollections(): Promise<readonly CatalogCollection[]>;
  getCatalogCollection(collectionId: string): Promise<CatalogCollection | null>;
  deleteCatalogCollection(collectionId: string): Promise<void>;
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
