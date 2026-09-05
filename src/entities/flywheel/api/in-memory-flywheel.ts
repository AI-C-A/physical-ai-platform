/* eslint-disable @typescript-eslint/require-await -- In-memory commands intentionally preserve the asynchronous Port contract. */
import type { ClockPort } from '@/shared/lib/clock';
import { createCollectionVisuals } from './in-memory-collection-visuals';

import type {
  AnnotationTask,
  CatalogCollection,
  CollectionHandPoseFrame,
  CollectionHandPoseTelemetry,
  CollectionStreamTelemetry,
  CollectionTelemetryModality,
  CollectionTelemetrySnapshot,
  CollectionTimelineTrack,
  CollectionTemplate,
  CollectorAcknowledgement,
  ComputeResource,
  CreateDatasetVersionInput,
  CreateDeploymentInput,
  CreateEvaluationRunInput,
  CreateHumanoidSessionInput,
  CreateHumanDemonstrationSessionInput,
  CreateMobilitySessionInput,
  CreateTrainingRunInput,
  DataUnitKind,
  DatasetUnitRef,
  DatasetVersion,
  Deployment,
  DriveSession,
  EvaluationRun,
  FailureCluster,
  FlywheelCaptureSession,
  FlywheelEpisode,
  FlywheelOverview,
  FlywheelPort,
  FlywheelStream,
  HandPoseBatchReceiptInput,
  HandPosePreviewInput,
  HumanDemonstrationBinding,
  HumanDemonstrationPairingResult,
  HumanDemonstrationProfile,
  HumanDemonstrationSourceState,
  HumanoidCaptureSession,
  InferenceSession,
  InterventionEvent,
  LineageEdge,
  LineageNode,
  MobilityCaptureSession,
  ModelVersion,
  PairHumanDemonstrationSourceInput,
  ProjectDescriptor,
  QualityRun,
  TrainingRun,
} from '../model/flywheel';

const defaultProvenance = {
  environment: 'simulation',
  deliveryMode: 'live',
  controlMode: 'mixed',
  dataOrigin: 'synthetic',
} as const;

const humanDemonstrationProfile: HumanDemonstrationProfile = {
  id: 'human-demo-quest-hand-v1',
  schemaVersion: 1,
  handTracking: {
    requiredHands: 'both',
    targetRateHz: 30,
    queueCapacityFrames: 60,
    maximumBatchFrames: 4,
    flushIntervalMs: 50,
    partialAfterMs: 120,
    lostAfterMs: 1_500,
  },
  streams: [
    {
      streamId: 'rbp-head-rgb', displayName: 'Head RGB · RBP Camera', modality: 'rgb', origin: 'sensor',
      sourceRole: 'head-camera', required: true, targetRateHz: 30, coordinateFrame: 'rbp-head-camera-optical',
      maximumDriftMs: 50, minimumCompletenessPercent: 98,
    },
    {
      streamId: 'quest-hand-left', displayName: 'Left Hand Pose · Quest', modality: 'hand-pose', origin: 'sensor',
      sourceRole: 'xr-hand-tracking', required: true, targetRateHz: 30, coordinateFrame: 'quest-local-floor',
      maximumDriftMs: 50, minimumCompletenessPercent: 98,
    },
    {
      streamId: 'quest-hand-right', displayName: 'Right Hand Pose · Quest', modality: 'hand-pose', origin: 'sensor',
      sourceRole: 'xr-hand-tracking', required: true, targetRateHz: 30, coordinateFrame: 'quest-local-floor',
      maximumDriftMs: 50, minimumCompletenessPercent: 98,
    },
    {
      streamId: 'external-fullbody-rgb', displayName: 'External RGB · Full body', modality: 'rgb', origin: 'sensor',
      sourceRole: 'external-scene-camera', required: false, targetRateHz: 30, coordinateFrame: 'external-camera-optical',
      maximumDriftMs: 80, minimumCompletenessPercent: 95,
    },
    {
      streamId: 'exoskeleton-state', displayName: 'Exoskeleton State', modality: 'exoskeleton-state', origin: 'state',
      sourceRole: 'exoskeleton', required: true, targetRateHz: 100, coordinateFrame: 'exoskeleton-body',
      maximumDriftMs: 30, minimumCompletenessPercent: 99,
    },
    {
      streamId: 'exoskeleton-control', displayName: 'Actuation / Control', modality: 'action', origin: 'control',
      sourceRole: 'exoskeleton', required: true, targetRateHz: 50, coordinateFrame: 'exoskeleton-body',
      maximumDriftMs: 30, minimumCompletenessPercent: 99,
    },
    {
      streamId: 'head-semantic', displayName: 'Head Semantic', modality: 'semantic', origin: 'derived',
      sourceRole: null, required: false, targetRateHz: null, coordinateFrame: 'rbp-head-camera-optical',
      maximumDriftMs: null, minimumCompletenessPercent: null,
    },
    {
      streamId: 'head-depth-estimated', displayName: 'Estimated Depth · Head RGB derived', modality: 'estimated-depth', origin: 'derived',
      sourceRole: null, required: false, targetRateHz: null, coordinateFrame: 'rbp-head-camera-optical',
      maximumDriftMs: null, minimumCompletenessPercent: null,
    },
  ],
};

function copyStreams(state: FlywheelStream['status'] = 'stopped'): readonly FlywheelStream[] {
  return [
    { id: 'camera-head', displayName: 'Head RGB', expectedRateHz: 30, observedRateHz: 29.8, bytesWritten: 836_000_000, status: state },
    { id: 'camera-head-depth', displayName: 'Head Depth', expectedRateHz: 30, observedRateHz: 29.6, bytesWritten: 428_000_000, status: state },
    { id: 'camera-front-rgb', displayName: 'Front RGB · Full body', expectedRateHz: 30, observedRateHz: 29.9, bytesWritten: 431_000_000, status: state },
    { id: 'robot-state', displayName: 'Robot State', expectedRateHz: 100, observedRateHz: 99.6, bytesWritten: 26_000_000, status: state },
    { id: 'action', displayName: 'Action', expectedRateHz: 50, observedRateHz: 49.8, bytesWritten: 14_000_000, status: state },
  ];
}

function humanDemonstrationStreams(
  binding: HumanDemonstrationBinding,
  state: FlywheelStream['status'] = 'waiting',
): readonly FlywheelStream[] {
  return binding.profile.streams.map((policy) => {
    const source = policy.sourceRole === null
      ? null
      : binding.sourceBindings.find((item) => item.role === policy.sourceRole) ?? null;
    const derived = policy.origin === 'derived';
    const sourceOnline = source !== null
      && (source.state === 'ready' || source.state === 'recording');
    return {
      id: policy.streamId,
      displayName: policy.displayName,
      expectedRateHz: policy.targetRateHz,
      observedRateHz: derived || !sourceOnline ? null : policy.targetRateHz,
      bytesWritten: 0,
      status: derived ? 'waiting' : sourceOnline ? state : source?.state === 'stale' ? 'stale' : 'waiting',
      origin: policy.origin,
      sourceDeviceId: source?.sourceDeviceId ?? null,
      coordinateFrame: policy.coordinateFrame,
      processingStatus: derived ? 'pending' : null,
    } satisfies FlywheelStream;
  });
}

interface HandPoseSessionMetrics {
  readonly firstDeviceTimestampMs: number;
  readonly lastDeviceTimestampMs: number;
  readonly lastReceivedTimestampMs: number;
  readonly frameCount: number;
  readonly byteLength: number;
  readonly leftPoseObserved: boolean;
  readonly rightPoseObserved: boolean;
  readonly leftSourcePresent: boolean;
  readonly rightSourcePresent: boolean;
  readonly leftLastObservedAtMs: number | null;
  readonly rightLastObservedAtMs: number | null;
  readonly latestHandPose: HandPoseBatchReceiptInput['latestHandPose'];
}

interface OperationalSnapshot {
  readonly sessions: FlywheelCaptureSession[];
  readonly episodes: FlywheelEpisode[];
  readonly handPoseMetrics: readonly (readonly [string, HandPoseSessionMetrics])[];
  readonly handPoseFrames: readonly (readonly [string, readonly CollectionHandPoseFrame[]])[];
  readonly handPosePreviews: readonly (readonly [string, CollectionHandPoseTelemetry])[];
}

export interface InMemoryFlywheelSyncTransport {
  readonly clientId: string;
  send(serializedMessage: string): void;
  subscribe(listener: (serializedMessage: string) => void): () => void;
}

interface InMemoryFlywheelOptions {
  readonly syncTransport?: InMemoryFlywheelSyncTransport;
}

interface OperationalSyncRequest {
  readonly schemaVersion: 1;
  readonly type: 'state-request';
  readonly senderId: string;
}

interface OperationalSyncSnapshot {
  readonly schemaVersion: 1;
  readonly type: 'state-snapshot';
  readonly senderId: string;
  readonly revision: number;
  readonly snapshot: OperationalSnapshot;
}

type OperationalSyncMessage = OperationalSyncRequest | OperationalSyncSnapshot;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isCollectionHandPoseTelemetry(value: unknown): value is HandPoseBatchReceiptInput['latestHandPose'] {
  if (!isRecord(value)
    || value.coordinateFrame !== 'quest-local-floor'
    || !isFiniteNumber(value.deviceTimestampMs)
    || !isFiniteNumber(value.receivedTimestampMs)
    || !isRecord(value.hands)) return false;
  const hands = value.hands;
  return ['left', 'right'].every((handedness) => {
    const hand = hands[handedness];
    if (!isRecord(hand)
      || typeof hand.sourcePresent !== 'boolean'
      || typeof hand.poseObserved !== 'boolean'
      || !Array.isArray(hand.joints)) return false;
    if (!hand.poseObserved) return hand.joints.length === 0;
    return hand.sourcePresent && hand.joints.length === 25 && hand.joints.every((joint) => (
      isRecord(joint)
      && typeof joint.name === 'string'
      && Array.isArray(joint.positionMeters)
      && joint.positionMeters.length === 3
      && joint.positionMeters.every(isFiniteNumber)
      && Array.isArray(joint.orientationQuaternion)
      && joint.orientationQuaternion.length === 4
      && joint.orientationQuaternion.every(isFiniteNumber)
      && (joint.radiusMeters === null || isFiniteNumber(joint.radiusMeters))
    ));
  });
}

function isHandPoseSessionMetrics(value: unknown): value is HandPoseSessionMetrics {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.firstDeviceTimestampMs)
    && isFiniteNumber(value.lastDeviceTimestampMs)
    && isFiniteNumber(value.lastReceivedTimestampMs)
    && isFiniteNumber(value.frameCount)
    && isFiniteNumber(value.byteLength)
    && typeof value.leftPoseObserved === 'boolean'
    && typeof value.rightPoseObserved === 'boolean'
    && typeof value.leftSourcePresent === 'boolean'
    && typeof value.rightSourcePresent === 'boolean'
    && isNullableFiniteNumber(value.leftLastObservedAtMs)
    && isNullableFiniteNumber(value.rightLastObservedAtMs)
    && isCollectionHandPoseTelemetry(value.latestHandPose);
}

function isCollectionHandPoseFrame(value: unknown): value is CollectionHandPoseFrame {
  return isRecord(value)
    && isCollectionHandPoseTelemetry(value)
    && isFiniteNumber(value.sequence)
    && isFiniteNumber(value.frameEpoch)
    && isFiniteNumber(value.episodeOffsetMs)
    && value.episodeOffsetMs >= 0;
}

function parseOperationalSnapshot(parsed: unknown): OperationalSnapshot | null {
  if (!isRecord(parsed) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.episodes)) return null;
  if (!parsed.sessions.every((session) => (
    isRecord(session)
    && typeof session.id === 'string'
    && (session.kind === 'humanoid' || session.kind === 'mobility')
  ))) return null;
  if (!parsed.episodes.every((episode) => (
    isRecord(episode)
    && typeof episode.id === 'string'
    && typeof episode.captureSessionId === 'string'
  ))) return null;
  const rawMetrics = parsed.handPoseMetrics ?? [];
  if (!Array.isArray(rawMetrics) || !rawMetrics.every((entry) => (
    Array.isArray(entry)
    && entry.length === 2
    && typeof entry[0] === 'string'
    && isHandPoseSessionMetrics(entry[1])
  ))) return null;
  const rawFrames = parsed.handPoseFrames ?? [];
  if (!Array.isArray(rawFrames) || !rawFrames.every((entry) => (
    Array.isArray(entry)
    && entry.length === 2
    && typeof entry[0] === 'string'
    && Array.isArray(entry[1])
    && entry[1].every(isCollectionHandPoseFrame)
  ))) return null;
  const rawPreviews = parsed.handPosePreviews ?? [];
  if (!Array.isArray(rawPreviews) || !rawPreviews.every((entry) => (
    Array.isArray(entry)
    && entry.length === 2
    && typeof entry[0] === 'string'
    && isCollectionHandPoseTelemetry(entry[1])
  ))) return null;
  return {
    sessions: (parsed.sessions as FlywheelCaptureSession[]).map((session) => (
      session.kind === 'humanoid'
        ? { ...session, humanDemonstration: session.humanDemonstration ?? null }
        : session
    )),
    episodes: (parsed.episodes as FlywheelEpisode[]).map((episode) => ({
      ...episode,
      humanDemonstration: episode.humanDemonstration ?? null,
    })),
    handPoseMetrics: rawMetrics as unknown as readonly (readonly [string, HandPoseSessionMetrics])[],
    handPoseFrames: rawFrames as unknown as readonly (readonly [string, readonly CollectionHandPoseFrame[]])[],
    handPosePreviews: rawPreviews as unknown as readonly (readonly [string, CollectionHandPoseTelemetry])[],
  };
}

function parseOperationalSyncMessage(serialized: string): OperationalSyncMessage | null {
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)
    || parsed.schemaVersion !== 1
    || typeof parsed.senderId !== 'string'
    || parsed.senderId.length === 0) return null;
  if (parsed.type === 'state-request') {
    return { schemaVersion: 1, type: 'state-request', senderId: parsed.senderId };
  }
  if (parsed.type !== 'state-snapshot'
    || !Number.isSafeInteger(parsed.revision)
    || typeof parsed.revision !== 'number'
    || parsed.revision < 0) return null;
  const snapshot = parseOperationalSnapshot(parsed.snapshot);
  return snapshot === null ? null : {
    schemaVersion: 1,
    type: 'state-snapshot',
    senderId: parsed.senderId,
    revision: parsed.revision,
    snapshot,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryFlywheel implements FlywheelPort {
  readonly #clock: ClockPort;
  readonly #listeners = new Set<() => void>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  readonly #handPoseMetrics = new Map<string, HandPoseSessionMetrics>();
  readonly #handPoseFrames = new Map<string, readonly CollectionHandPoseFrame[]>();
  readonly #handPosePreviews = new Map<string, CollectionHandPoseTelemetry>();
  readonly #syncTransport: InMemoryFlywheelSyncTransport | null;
  #syncUnsubscribe: (() => void) | null = null;
  #syncRevision = 0;
  #lastSyncSenderId = '';
  #sequence = 100;
  #disposed = false;
  #projects: ProjectDescriptor[];
  #sessions: FlywheelCaptureSession[];
  #episodes: FlywheelEpisode[];
  #drives: DriveSession[];
  #interventions: InterventionEvent[];
  #annotations: AnnotationTask[];
  #qualityRuns: QualityRun[];
  #datasets: DatasetVersion[];
  #trainingRuns: TrainingRun[];
  #evaluations: EvaluationRun[];
  #models: ModelVersion[];
  #deployments: Deployment[];
  #inferences: InferenceSession[];

  constructor(clock: ClockPort, options: InMemoryFlywheelOptions = {}) {
    this.#clock = clock;
    this.#syncTransport = options.syncTransport ?? null;
    const now = clock.nowMs();
    this.#projects = [
      { id: 'project-tiger', displayName: 'TIGER Physical AI', description: '휴머노이드·모바일 로봇 공통 플라이휠' },
      { id: 'project-logistics', displayName: 'Logistics Generalist', description: '물류 조작과 자율주행 데이터' },
    ];
    this.#sessions = [
      {
        id: 'capture-h-001', projectId: 'project-tiger', siteId: 'site-lab', name: 'Desktop sorting batch', kind: 'humanoid',
        robotId: 'robot-001', robotType: 'humanoid', sensorDeviceId: 'sensor-rig-001', provenance: defaultProvenance,
        status: 'completed', createdAtMs: now - 86_400_000, updatedAtMs: now - 82_200_000, startedAtMs: now - 85_800_000, stoppedAtMs: now - 82_200_000,
        bytesWritten: 3_420_000_000, streams: copyStreams(), preflight: this.#passedPreflight(), taskId: 'task-sort-fruit',
        instruction: 'Sort the fruit into the matching trays', sensorPresetId: 'preset-humanoid-default',
        episodeIds: ['episode-fw-001', 'episode-fw-002'], activeEpisodeId: null, processingStage: null, errorMessage: null,
        humanDemonstration: null,
      },
      {
        id: 'capture-m-001', projectId: 'project-tiger', siteId: 'site-pangyo', name: 'Pangyo patrol route A', kind: 'mobility',
        robotId: 'robot-002', robotType: 'quadruped', sensorDeviceId: 'sensor-rig-002', provenance: { ...defaultProvenance, controlMode: 'autonomous' },
        status: 'completed', createdAtMs: now - 43_200_000, updatedAtMs: now - 39_300_000, startedAtMs: now - 42_900_000, stoppedAtMs: now - 39_300_000,
        bytesWritten: 8_840_000_000, streams: copyStreams(), preflight: this.#passedPreflight(), routeId: 'route-a',
        driveSessionId: 'drive-001', interventionIds: ['intervention-001'],
        chunkPolicy: { durationMs: 300_000, preBufferMs: 10_000, postBufferMs: 20_000 }, controlMode: 'autonomous',
      },
    ];
    this.#episodes = [
      this.#seedEpisode('episode-fw-001', 'capture-h-001', 'Pick and place · 01', 'success', now - 85_700_000, 42_000),
      this.#seedEpisode('episode-fw-002', 'capture-h-001', 'Pick and place · 02', 'failure', now - 84_900_000, 36_000),
    ];
    this.#drives = [{
      id: 'drive-001', projectId: 'project-tiger', siteId: 'site-pangyo', captureSessionId: 'capture-m-001', robotId: 'robot-002',
      routeId: 'route-a', status: 'completed', startedAtMs: now - 42_900_000, endedAtMs: now - 39_300_000,
      durationMs: 3_600_000, distanceMeters: 2_840, autonomyRatio: 0.94,
      chunks: Array.from({ length: 12 }, (_, index) => ({
        id: `chunk-${String(index + 1).padStart(2, '0')}`,
        startMs: now - 42_900_000 + index * 300_000,
        endMs: now - 42_900_000 + (index + 1) * 300_000,
        bytesWritten: 730_000_000,
      })), interventionIds: ['intervention-001'], qualityStatus: 'passed',
    }];
    this.#interventions = [{
      id: 'intervention-001', projectId: 'project-tiger', siteId: 'site-pangyo', driveSessionId: 'drive-001', robotId: 'robot-002',
      status: 'needs-review', trigger: 'control-transition', startMs: now - 41_610_000, controlReturnedAtMs: now - 41_570_000,
      endMs: now - 41_550_000, reason: 'obstacle', severity: 'medium', outcome: 'rerouted',
      note: '통로에 임시 적재물이 감지되어 우회했습니다.', qualityStatus: 'passed',
    }];
    this.#annotations = [{
      id: 'annotation-001', projectId: 'project-tiger', name: 'Sorting task outcome review', dataKind: 'humanoid-episode',
      schemaName: 'VLA Task v2', assignee: 'collector1', reviewer: 'auditor1', status: 'in-progress', totalItems: 48,
      completedItems: 31, description: 'Task 결과, subtask 경계와 실패 원인을 검수합니다.',
    }];
    this.#qualityRuns = [{
      id: 'quality-001', projectId: 'project-tiger', name: 'Episode synchronization QC', ruleSetId: 'rules-vla-default',
      dataKind: 'humanoid-episode', status: 'completed', passedItems: 43, failedItems: 4, quarantinedItems: 1,
      issues: ['Head RGB frame drop 4.3%', 'Action/State drift 68ms'], createdAtMs: now - 80_000_000,
    }];
    this.#datasets = [
      { id: 'dataset-h-v3', familyId: 'dataset-h', projectId: 'project-tiger', name: 'Sorting Generalist', version: 3,
        description: '과일 분류 휴머노이드 Episode', tags: ['sorting', 'humanoid'], kind: 'humanoid-episode', status: 'released',
        unitRefs: [{ kind: 'episode', episodeId: 'episode-fw-001' }], split: { train: 80, validation: 10, test: 10 },
        createdAtMs: now - 70_000_000, updatedAtMs: now - 69_000_000, validation: [] },
      { id: 'dataset-i-v1', familyId: 'dataset-i', projectId: 'project-tiger', name: 'Patrol Interventions', version: 1,
        description: '주행 개입 전후 Window', tags: ['navigation', 'intervention'], kind: 'intervention-window', status: 'released',
        unitRefs: [{ kind: 'intervention-window', interventionId: 'intervention-001', preMs: 10_000, postMs: 20_000 }],
        split: { train: 80, validation: 10, test: 10 }, createdAtMs: now - 60_000_000, updatedAtMs: now - 59_000_000, validation: [] },
    ];
    this.#trainingRuns = [{
      id: 'training-001', projectId: 'project-tiger', name: 'π0 sorting finetune', datasetVersionId: 'dataset-h-v3', modelFamily: 'pi0',
      computeResourceIds: ['gpu-0', 'gpu-1'], status: 'succeeded', batchSize: 8, steps: 10_000, learningRate: 0.000025,
      currentStep: 10_000, metrics: [{ step: 0, loss: 1.84, throughput: 92 }, { step: 5000, loss: 0.73, throughput: 96 }, { step: 10_000, loss: 0.31, throughput: 97 }],
      logs: ['Dataset manifest verified', 'Checkpoint 5000 saved', 'Training completed'], checkpoints: ['checkpoint-5000', 'checkpoint-10000'],
      createdAtMs: now - 50_000_000, modelVersionId: 'model-pi0-v3',
    }];
    this.#models = [{
      id: 'model-pi0-v3', projectId: 'project-tiger', name: 'TIGER π0 Sorting', version: 3, modelFamily: 'pi0', robotType: 'humanoid',
      stage: 'production', trainingRunId: 'training-001', datasetVersionId: 'dataset-h-v3', evaluationRunIds: ['evaluation-001'],
      artifactSizeBytes: 8_240_000_000, createdAtMs: now - 45_000_000,
    }];
    this.#evaluations = [{
      id: 'evaluation-001', projectId: 'project-tiger', name: 'Sorting regression suite', modelVersionId: 'model-pi0-v3',
      baselineModelVersionId: null, robotType: 'humanoid', environment: 'simulation', scenario: 'Fruit sorting · mixed lighting',
      repetitions: 50, passThreshold: 80, status: 'passed', score: 88.4,
      metrics: [{ label: 'Task 성공률', value: 88.4, unit: '%' }, { label: '평균 완료시간', value: 41.2, unit: 's' }, { label: '복구 성공률', value: 72, unit: '%' }],
      createdAtMs: now - 44_000_000,
    }];
    this.#deployments = [{
      id: 'deployment-001', projectId: 'project-tiger', name: 'Sorting canary', modelVersionId: 'model-pi0-v3', robotIds: ['robot-001'],
      status: 'active', runtime: 'TensorRT Edge', controlFrequencyHz: 20, rolloutPercent: 100, latencyMs: 42, actionRateHz: 19.8,
      createdAtMs: now - 30_000_000,
    }];
    this.#inferences = [{
      id: 'inference-001', projectId: 'project-tiger', deploymentId: 'deployment-001', modelVersionId: 'model-pi0-v3', robotId: 'robot-001',
      task: 'Sort the fruit into matching trays', status: 'completed', outcome: 'success', averageLatencyMs: 42, actionRateHz: 19.8,
      interventionId: null, startedAtMs: now - 20_000_000, endedAtMs: now - 19_940_000,
      steps: [
        { timestampMs: now - 20_000_000, prompt: 'Locate red apple', action: 'move_left_arm', confidence: 0.94 },
        { timestampMs: now - 19_980_000, prompt: 'Grasp red apple', action: 'close_gripper', confidence: 0.89 },
        { timestampMs: now - 19_960_000, prompt: 'Place in red tray', action: 'move_and_release', confidence: 0.92 },
      ],
    }];
    if (this.#syncTransport !== null) {
      this.#syncUnsubscribe = this.#syncTransport.subscribe(this.#handleSyncMessage);
      this.#sendSyncMessage({
        schemaVersion: 1,
        type: 'state-request',
        senderId: this.#syncTransport.clientId,
      });
    }
  }

  listProjects = () => Promise.resolve(clone(this.#projects));
  listTemplates = (): Promise<readonly CollectionTemplate[]> => Promise.resolve([
    { id: 'template-h', projectId: 'project-tiger', name: 'Humanoid VLA default', kind: 'humanoid', robotType: 'humanoid', streamIds: copyStreams().map((item) => item.id), syncToleranceMs: 50, preBufferMs: 0, postBufferMs: 0 },
    { id: 'template-m', projectId: 'project-tiger', name: 'Mobility intervention default', kind: 'mobility', robotType: 'quadruped', streamIds: copyStreams().map((item) => item.id), syncToleranceMs: 80, preBufferMs: 10_000, postBufferMs: 20_000 },
  ]);
  listSessions = () => Promise.resolve(clone(this.#sessions));
  listOperationalSessions = () => Promise.resolve(clone(
    this.#sessions.filter((item): item is HumanoidCaptureSession =>
      item.kind === 'humanoid' && item.status !== 'completed' && item.status !== 'abandoned'),
  ));
  async deleteOperationalSession(sessionId: string): Promise<void> {
    const session = this.#requireSession(sessionId);
    if (session.kind !== 'humanoid' || session.status === 'completed') {
      throw new Error('진행 중인 휴머노이드 세션만 삭제할 수 있습니다.');
    }
    const referencedEpisodeIds = new Set(
      this.#datasets.flatMap((dataset) => dataset.unitRefs.flatMap((ref) =>
        ref.kind === 'episode' ? [ref.episodeId] : [])),
    );
    this.#sessions = this.#sessions.filter((item) => item.id !== sessionId);
    const removedEpisodeIds = this.#episodes
      .filter((episode) => episode.captureSessionId === sessionId && !referencedEpisodeIds.has(episode.id))
      .map((episode) => episode.id);
    this.#episodes = this.#episodes.filter((episode) =>
      episode.captureSessionId !== sessionId || referencedEpisodeIds.has(episode.id));
    removedEpisodeIds.forEach((episodeId) => this.#handPoseFrames.delete(episodeId));
    this.#handPoseMetrics.delete(sessionId);
    this.#handPosePreviews.delete(sessionId);
    this.#notify();
  }
  getSession = (id: string) => Promise.resolve(clone(this.#sessions.find((item) => item.id === id) ?? null));
  getCollectionTelemetry = (sessionId: string): Promise<CollectionTelemetrySnapshot | null> => {
    const session = this.#sessions.find((item) => item.id === sessionId);
    if (session?.kind !== 'humanoid') return Promise.resolve(null);

    if (session.humanDemonstration !== null) {
      return Promise.resolve(clone(this.#getHumanDemonstrationTelemetry(session)));
    }

    const observedAtMs = this.#clock.nowMs();
    const activeEpisode = session.activeEpisodeId === null
      ? null
      : this.#episodes.find((item) => item.id === session.activeEpisodeId) ?? null;
    const sessionEpisodes = this.#episodes.filter((item) => item.captureSessionId === session.id);
    const elapsedMs = activeEpisode === null
      ? Math.max(0, (session.stoppedAtMs ?? observedAtMs) - (session.startedAtMs ?? observedAtMs))
      : Math.max(0, (activeEpisode.endedAtMs ?? observedAtMs) - activeEpisode.startedAtMs);
    const capturedDurationMs = sessionEpisodes.reduce((total, episode) => (
      total + Math.max(0, (episode.endedAtMs ?? observedAtMs) - episode.startedAtMs)
    ), 0);
    const isConnected = session.status === 'active' || session.status === 'recording';
    const requiredStreamIds = new Set(['camera-head', 'robot-state', 'action']);
    const modalityByStream: Readonly<Record<string, CollectionTelemetryModality>> = {
      'camera-front-rgb': 'rgb',
      'camera-head': 'rgb',
      'camera-head-depth': 'depth',
      'robot-state': 'robot-state',
      action: 'action',
    };
    const latencyByStream: Readonly<Record<string, number>> = {
      'camera-front-rgb': 31,
      'camera-head': 38,
      'camera-head-depth': 54,
      'robot-state': 8,
      action: 12,
    };
    const driftByStream: Readonly<Record<string, number>> = {
      'camera-front-rgb': 11,
      'camera-head': 14,
      'camera-head-depth': 18,
      'robot-state': 5,
      action: 9,
    };

    const streams: readonly CollectionStreamTelemetry[] = session.streams.map((stream) => {
      const required = requiredStreamIds.has(stream.id);
      const degraded = stream.status === 'stale';
      const disconnected = degraded && required;
      const connectionState = disconnected
        ? 'offline' as const
        : degraded
          ? 'stale' as const
          : isConnected
            ? 'live' as const
            : 'offline' as const;
      const observedRateHz = connectionState === 'offline' ? null : stream.observedRateHz;
      const driftMs = degraded ? (required ? 186 : 74) : driftByStream[stream.id] ?? 16;
      const sampleCount = Math.floor(
        capturedDurationMs / 1_000 * Math.max(0, observedRateHz ?? 0),
      );
      return {
        streamId: stream.id,
        displayName: stream.displayName,
        modality: modalityByStream[stream.id] ?? 'robot-state',
        required,
        health: disconnected ? 'disconnected' : degraded ? 'degraded' : 'healthy',
        connectionState,
        expectedRateHz: stream.expectedRateHz,
        observedRateHz,
        latencyMs: connectionState === 'offline' ? null : degraded ? 128 : latencyByStream[stream.id] ?? 24,
        driftMs: connectionState === 'offline' && !isConnected ? null : driftMs,
        sampleCount,
        droppedFrameCount: degraded
          ? (required ? 38 : 14)
          : isConnected && stream.id.includes('camera')
            ? 1
            : 0,
        missingSampleCount: degraded ? (required ? 25 : 7) : 0,
        bytesWritten: Math.floor(Math.max(stream.bytesWritten, sampleCount * (
          stream.id.includes('camera') ? 420_000 : 260
        ))),
        lastSampleAtMs: connectionState === 'live'
          ? observedAtMs
          : connectionState === 'stale'
            ? observedAtMs - 7_000
            : session.stoppedAtMs ?? observedAtMs - 18_000,
      };
    });
    const disconnectedStream = streams.find((stream) => stream.health === 'disconnected');
    const degradedStreams = streams.filter((stream) => stream.health === 'degraded');
    const hasCapturedData = capturedDurationMs > 0 || session.bytesWritten > 0;
    const maxDriftMs = streams.reduce<number | null>((maximum, stream) => (
      stream.driftMs === null ? maximum : Math.max(maximum ?? 0, stream.driftMs)
    ), null);
    const qualityIssues = [
      ...degradedStreams.map((stream) => ({
        id: `degraded-${stream.streamId}`,
        severity: 'warning' as const,
        streamId: stream.streamId,
        message: `${stream.displayName}에서 ${String(stream.missingSampleCount)}개 누락과 ${String(stream.droppedFrameCount)}개 drop이 감지되었습니다.`,
      })),
      ...(maxDriftMs !== null && maxDriftMs > 50 ? [{
        id: 'sync-drift',
        severity: disconnectedStream === undefined ? 'warning' as const : 'critical' as const,
        streamId: disconnectedStream?.streamId ?? degradedStreams[0]?.streamId ?? null,
        message: '멀티모달 timestamp drift가 허용 범위 50 ms를 초과했습니다.',
      }] : []),
      ...(disconnectedStream === undefined ? [] : [{
        id: `disconnected-${disconnectedStream.streamId}`,
        severity: 'critical' as const,
        streamId: disconnectedStream.streamId,
        message: `필수 ${disconnectedStream.displayName} stream 연결이 끊겼습니다.`,
      }]),
      ...(hasCapturedData ? [] : [{
        id: 'no-captured-data',
        severity: 'warning' as const,
        streamId: null,
        message: '학습 품질을 판정할 Episode 데이터가 아직 없습니다.',
      }]),
    ];
    const timelineStreamIds = ['camera-head', 'camera-head-depth', 'robot-state', 'action'];
    const timelineTracks: readonly CollectionTimelineTrack[] = timelineStreamIds.flatMap((streamId) => {
      const stream = streams.find((item) => item.streamId === streamId);
      if (stream === undefined) return [];
      const anomalies = stream.health === 'healthy' ? [] : [
        {
          startOffsetMs: -7_600,
          endOffsetMs: -7_050,
          kind: stream.health === 'disconnected' ? 'missing' as const : 'drop' as const,
          severity: stream.health === 'disconnected' ? 'critical' as const : 'warning' as const,
          label: stream.health === 'disconnected' ? '수신 단절' : 'frame drop',
        },
        {
          startOffsetMs: -3_300,
          endOffsetMs: -2_650,
          kind: 'drift' as const,
          severity: stream.health === 'disconnected' ? 'critical' as const : 'warning' as const,
          label: `${String(stream.driftMs ?? 0)} ms drift`,
        },
      ];
      return [{
        streamId,
        label: stream.modality === 'rgb'
          ? 'RGB'
          : stream.modality === 'depth'
            ? 'Depth'
            : stream.modality === 'robot-state'
              ? 'Robot State'
              : 'Action',
        health: stream.health,
        anomalies,
      }];
    });
    const totalSampleCount = streams.reduce((total, stream) => total + stream.sampleCount, 0);
    const estimatedBytes = sessionEpisodes.reduce((total, episode) => total + episode.bytesWritten, 0)
      + (activeEpisode?.status === 'recording' ? Math.floor(elapsedMs / 1_000 * 12_000_000) : 0);
    const connectionState = disconnectedStream !== undefined
      ? 'offline' as const
      : degradedStreams.length > 0
        ? 'stale' as const
        : isConnected
          ? 'live' as const
          : 'offline' as const;
    const qualityVerdict = disconnectedStream !== undefined
      ? 'not-ready' as const
      : !hasCapturedData
        ? 'not-ready' as const
        : degradedStreams.length > 0 || (maxDriftMs ?? 0) > 50
        ? 'review' as const
        : 'training-ready' as const;

    return Promise.resolve(clone({
      sessionId: session.id,
      activeEpisodeId: session.activeEpisodeId,
      observedAtMs,
      freshness: { staleAfterMs: 5_000, offlineAfterMs: 15_000 },
      connectionState,
      elapsedMs,
      totalSampleCount,
      bytesWritten: Math.max(session.bytesWritten, estimatedBytes),
      completenessPercent: !hasCapturedData
        ? 0
        : disconnectedStream !== undefined
        ? 82.4
        : degradedStreams.length > 0
          ? 98.7
          : 99.8,
      qualityVerdict,
      qualityIssues,
      sync: {
        state: disconnectedStream !== undefined
          ? 'out-of-sync' as const
          : (maxDriftMs ?? 0) > 50
            ? 'warning' as const
            : isConnected
              ? 'aligned' as const
              : 'unavailable' as const,
        toleranceMs: 50,
        maxDriftMs,
      },
      streams,
      timeline: { windowMs: 10_000, tracks: timelineTracks },
      spatial: {
        coordinateFrame: 'base_link',
        positionMeters: [0.42, -0.08, 0.94],
        orientationRpyDegrees: [0.4, -1.7, 89.6],
        poseRateHz: streams.find((stream) => stream.streamId === 'robot-state')?.observedRateHz ?? null,
        pointCloud: {
          available: streams.some((stream) => stream.modality === 'depth' && stream.connectionState !== 'offline'),
          pointCount: streams.some((stream) => stream.modality === 'depth' && stream.connectionState !== 'offline') ? 307_200 : null,
          lastFrameAtMs: streams.find((stream) => stream.modality === 'depth')?.lastSampleAtMs ?? null,
        },
      },
      handPose: null,
      ...(isConnected ? createCollectionVisuals(activeEpisode?.endedAtMs ?? observedAtMs, 'camera-head') : {}),
    } satisfies CollectionTelemetrySnapshot));
  };
  listCatalogCollections = () => Promise.resolve(clone(this.#catalogCollections()));
  getCatalogCollection = (id: string) => Promise.resolve(clone(
    this.#catalogCollections().find((item) => item.id === id) ?? null,
  ));
  async deleteCatalogCollection(collectionId: string): Promise<void> {
    const session = this.#requireSession(collectionId);
    if (session.kind !== 'humanoid' || session.status !== 'completed') {
      throw new Error('카탈로그에 등록된 휴머노이드 수집만 삭제할 수 있습니다.');
    }
    const referencedEpisodeIds = new Set(
      this.#datasets.flatMap((dataset) => dataset.unitRefs.flatMap((ref) =>
        ref.kind === 'episode' ? [ref.episodeId] : [])),
    );
    this.#sessions = this.#sessions.filter((item) => item.id !== collectionId);
    this.#episodes = this.#episodes.filter((episode) =>
      episode.captureSessionId !== collectionId || referencedEpisodeIds.has(episode.id));
    this.#notify();
  }
  listEpisodes = () => Promise.resolve(clone(this.#episodes));
  getEpisode = (id: string) => Promise.resolve(clone(this.#episodes.find((item) => item.id === id) ?? null));
  listDriveSessions = () => Promise.resolve(clone(this.#drives));
  getDriveSession = (id: string) => Promise.resolve(clone(this.#drives.find((item) => item.id === id) ?? null));
  listInterventions = () => Promise.resolve(clone(this.#interventions));
  getIntervention = (id: string) => Promise.resolve(clone(this.#interventions.find((item) => item.id === id) ?? null));
  listAnnotationTasks = () => Promise.resolve(clone(this.#annotations));
  listQualityRuns = () => Promise.resolve(clone(this.#qualityRuns));
  getQualityRun = (id: string) => Promise.resolve(clone(this.#qualityRuns.find((item) => item.id === id) ?? null));
  listDatasets = () => Promise.resolve(clone(this.#datasets));
  getDataset = (id: string) => Promise.resolve(clone(this.#datasets.find((item) => item.id === id) ?? null));
  listComputeResources = () => Promise.resolve(clone(this.#computeResources()));
  listTrainingRuns = () => Promise.resolve(clone(this.#trainingRuns));
  getTrainingRun = (id: string) => Promise.resolve(clone(this.#trainingRuns.find((item) => item.id === id) ?? null));
  listEvaluationRuns = () => Promise.resolve(clone(this.#evaluations));
  getEvaluationRun = (id: string) => Promise.resolve(clone(this.#evaluations.find((item) => item.id === id) ?? null));
  listModelVersions = () => Promise.resolve(clone(this.#models));
  getModelVersion = (id: string) => Promise.resolve(clone(this.#models.find((item) => item.id === id) ?? null));
  listDeployments = () => Promise.resolve(clone(this.#deployments));
  getDeployment = (id: string) => Promise.resolve(clone(this.#deployments.find((item) => item.id === id) ?? null));
  listInferenceSessions = () => Promise.resolve(clone(this.#inferences));
  getInferenceSession = (id: string) => Promise.resolve(clone(this.#inferences.find((item) => item.id === id) ?? null));

  async createHumanoidSession(input: CreateHumanoidSessionInput): Promise<HumanoidCaptureSession> {
    this.#assertActive();
    const session: HumanoidCaptureSession = {
      ...input, id: this.#nextId('capture-h'), kind: 'humanoid', robotType: 'humanoid', provenance: defaultProvenance,
      status: 'draft', createdAtMs: this.#clock.nowMs(), updatedAtMs: this.#clock.nowMs(), startedAtMs: null, stoppedAtMs: null, bytesWritten: 0,
      sensorPresetId: input.sensorPresetId ?? 'preset-humanoid-default',
      streams: copyStreams('waiting'), preflight: [], episodeIds: [], activeEpisodeId: null, processingStage: null, errorMessage: null,
      humanDemonstration: null,
    };
    this.#sessions = [session, ...this.#sessions];
    this.#notify();
    return clone(session);
  }

  async createHumanDemonstrationSession(
    input: CreateHumanDemonstrationSessionInput,
  ): Promise<HumanoidCaptureSession> {
    this.#assertActive();
    if (input.profileId !== undefined && input.profileId !== humanDemonstrationProfile.id) {
      throw new Error('지원하지 않는 Human Demonstration profile입니다.');
    }
    const id = this.#nextId('capture-hd');
    const participantId = `participant-${id}`;
    const sourceBindings: HumanDemonstrationBinding['sourceBindings'] = [
      {
        sourceDeviceId: input.questDeviceId,
        role: 'xr-hand-tracking',
        integrationProfileId: 'quest-webxr-hand-pose-v1',
        required: true,
        state: 'pending',
        capabilities: ['left-hand-pose', 'right-hand-pose'],
        lastSeenAtMs: null,
        activeEpisodeId: null,
      },
      {
        sourceDeviceId: input.headCameraDeviceId,
        role: 'head-camera',
        integrationProfileId: 'rbp-head-rgb-pending-v1',
        required: true,
        state: 'ready',
        capabilities: ['head-rgb'],
        lastSeenAtMs: this.#clock.nowMs(),
        activeEpisodeId: null,
      },
      {
        sourceDeviceId: input.exoskeletonDeviceId,
        role: 'exoskeleton',
        integrationProfileId: 'exoskeleton-state-v1',
        required: true,
        state: 'ready',
        capabilities: ['joint-state', 'actuation-control'],
        lastSeenAtMs: this.#clock.nowMs(),
        activeEpisodeId: null,
      },
      ...(input.externalCameraDeviceId.trim() === '' ? [] : [{
        sourceDeviceId: input.externalCameraDeviceId,
        role: 'external-scene-camera' as const,
        integrationProfileId: 'external-rgb-pending-v1',
        required: false,
        state: 'ready' as const,
        capabilities: ['external-rgb'],
        lastSeenAtMs: this.#clock.nowMs(),
        activeEpisodeId: null,
      }]),
    ];
    const humanDemonstration: HumanDemonstrationBinding = {
      participantId,
      participantIdScope: 'session',
      exoskeletonDeviceId: input.exoskeletonDeviceId,
      profile: humanDemonstrationProfile,
      sourceBindings,
      collectorAcknowledgements: [],
      pairing: {
        code: String(100_000 + this.#sequence % 900_000),
        expiresAtMs: this.#clock.nowMs() + 30 * 60_000,
      },
    };
    const session: HumanoidCaptureSession = {
      id,
      projectId: input.projectId,
      siteId: input.siteId,
      name: input.name,
      kind: 'humanoid',
      robotId: null,
      robotType: null,
      sensorDeviceId: null,
      provenance: defaultProvenance,
      status: 'draft',
      createdAtMs: this.#clock.nowMs(),
      updatedAtMs: this.#clock.nowMs(),
      startedAtMs: null,
      stoppedAtMs: null,
      bytesWritten: 0,
      streams: humanDemonstrationStreams(humanDemonstration),
      preflight: [],
      taskId: input.taskId,
      instruction: input.instruction,
      sensorPresetId: humanDemonstrationProfile.id,
      episodeIds: [],
      activeEpisodeId: null,
      processingStage: null,
      errorMessage: null,
      humanDemonstration,
    };
    this.#sessions = [session, ...this.#sessions];
    this.#notify();
    return clone(session);
  }

  async pairHumanDemonstrationSource(
    input: PairHumanDemonstrationSourceInput,
  ): Promise<HumanDemonstrationPairingResult> {
    this.#assertActive();
    const now = this.#clock.nowMs();
    const session = this.#sessions.find((item): item is HumanoidCaptureSession => (
      item.kind === 'humanoid'
      && item.humanDemonstration !== null
      && item.humanDemonstration.pairing.code === input.pairingCode
    ));
    if (session === undefined || session.humanDemonstration === null) {
      throw new Error('유효한 Human Demonstration Session을 찾을 수 없습니다.');
    }
    if (session.humanDemonstration.pairing.expiresAtMs !== null
      && session.humanDemonstration.pairing.expiresAtMs < now) {
      throw new Error('페어링 코드가 만료되었습니다. PC에서 새 Session을 만드세요.');
    }
    const source = session.humanDemonstration.sourceBindings.find((item) => item.role === 'xr-hand-tracking');
    if (source === undefined || source.sourceDeviceId !== input.sourceDeviceId) {
      throw new Error('Session에 등록된 XR collector 장치와 일치하지 않습니다.');
    }
    if (input.integrationProfileId !== source.integrationProfileId
      || !source.capabilities.every((capability) => input.capabilities.includes(capability))) {
      throw new Error('XR collector capability 또는 integration profile이 일치하지 않습니다.');
    }
    const humanDemonstration: HumanDemonstrationBinding = {
      ...session.humanDemonstration,
      sourceBindings: session.humanDemonstration.sourceBindings.map((item) => item.sourceDeviceId === source.sourceDeviceId
        ? { ...item, state: 'paired', lastSeenAtMs: now }
        : item),
    };
    this.#replaceSession({
      ...session,
      humanDemonstration,
      streams: humanDemonstrationStreams(humanDemonstration, session.status === 'active' ? 'active' : 'waiting'),
    });
    return clone({
      sessionId: session.id,
      sourceDeviceId: source.sourceDeviceId,
      participantId: humanDemonstration.participantId,
      profile: humanDemonstration.profile,
      activeEpisodeId: session.activeEpisodeId,
    });
  }

  async updateHumanDemonstrationSource(
    sessionId: string,
    sourceDeviceId: string,
    state: HumanDemonstrationSourceState,
  ): Promise<HumanoidCaptureSession> {
    const session = this.#requireHumanDemonstrationSession(sessionId);
    const source = session.humanDemonstration.sourceBindings.find((item) => item.sourceDeviceId === sourceDeviceId);
    if (source === undefined) throw new Error('Session source binding을 찾을 수 없습니다.');
    const humanDemonstration: HumanDemonstrationBinding = {
      ...session.humanDemonstration,
      sourceBindings: session.humanDemonstration.sourceBindings.map((item) => item.sourceDeviceId === sourceDeviceId
        ? {
          ...item,
          state,
          lastSeenAtMs: state === 'offline' || state === 'error' ? item.lastSeenAtMs : this.#clock.nowMs(),
        }
        : item),
    };
    const allRequiredSourcesReady = humanDemonstration.sourceBindings
      .filter((item) => item.required)
      .every((item) => item.state === 'ready' || item.state === 'recording');
    const updated: HumanoidCaptureSession = {
      ...session,
      humanDemonstration,
      errorMessage: allRequiredSourcesReady ? null : session.errorMessage,
      streams: humanDemonstrationStreams(
        humanDemonstration,
        session.status === 'active' || session.status === 'recording' ? 'active' : 'waiting',
      ).map((stream) => {
        const previous = session.streams.find((item) => item.id === stream.id);
        return previous === undefined
          ? stream
          : { ...stream, bytesWritten: previous.bytesWritten, observedRateHz: previous.observedRateHz };
      }),
    };
    if (session.activeEpisodeId !== null) {
      this.#episodes = this.#episodes.map((episode) => {
        if (episode.id !== session.activeEpisodeId || episode.humanDemonstration === null) return episode;
        return {
          ...episode,
          humanDemonstration,
          streams: humanDemonstrationStreams(
            humanDemonstration,
            episode.status === 'recording' ? 'active' : 'stopped',
          ).map((stream) => {
            const previous = episode.streams.find((item) => item.id === stream.id);
            return previous === undefined
              ? stream
              : { ...stream, bytesWritten: previous.bytesWritten, observedRateHz: previous.observedRateHz };
          }),
        };
      });
    }
    this.#replaceSession(updated);
    return clone(updated);
  }

  async acknowledgeCollectorCommand(
    acknowledgement: CollectorAcknowledgement,
  ): Promise<HumanoidCaptureSession> {
    const session = this.#requireHumanDemonstrationSession(acknowledgement.sessionId);
    const source = session.humanDemonstration.sourceBindings.find(
      (item) => item.sourceDeviceId === acknowledgement.sourceDeviceId,
    );
    if (source === undefined) throw new Error('Collector acknowledgement source가 Session에 없습니다.');
    if (!session.episodeIds.includes(acknowledgement.episodeId)) {
      throw new Error('Collector acknowledgement Episode가 Session에 없습니다.');
    }
    const acknowledgements = session.humanDemonstration.collectorAcknowledgements.filter((item) => !(
      item.episodeId === acknowledgement.episodeId
      && item.sourceDeviceId === acknowledgement.sourceDeviceId
      && item.command === acknowledgement.command
    ));
    const humanDemonstration: HumanDemonstrationBinding = {
      ...session.humanDemonstration,
      collectorAcknowledgements: [...acknowledgements, acknowledgement],
      sourceBindings: session.humanDemonstration.sourceBindings.map((item) => item.sourceDeviceId === acknowledgement.sourceDeviceId
        ? {
          ...item,
          state: acknowledgement.state === 'rejected'
            ? 'error'
            : acknowledgement.command === 'start' ? 'recording' : 'ready',
          activeEpisodeId: acknowledgement.command === 'start' && acknowledgement.state === 'acknowledged'
            ? acknowledgement.episodeId
            : null,
          lastSeenAtMs: acknowledgement.acknowledgedAtMs,
        }
        : item),
    };
    this.#episodes = this.#episodes.map((episode) => (
      episode.id === acknowledgement.episodeId && episode.humanDemonstration !== null
        ? { ...episode, humanDemonstration }
        : episode
    ));
    const updated = { ...session, humanDemonstration };
    this.#replaceSession(updated);
    return clone(updated);
  }

  async reportHandPoseBatch(input: HandPoseBatchReceiptInput): Promise<void> {
    const session = this.#requireHumanDemonstrationSession(input.sessionId);
    if (session.activeEpisodeId !== input.episodeId || input.frameCount <= 0) {
      throw new Error('현재 기록 중인 Episode의 Hand Pose batch만 수신할 수 있습니다.');
    }
    const source = session.humanDemonstration.sourceBindings.find((item) => item.sourceDeviceId === input.sourceDeviceId);
    if (source?.role !== 'xr-hand-tracking') throw new Error('Hand Pose source binding이 일치하지 않습니다.');
    if (input.firstSequence > input.lastSequence || input.receivedTimestampMs < 0 || input.deviceTimestampMs < 0) {
      throw new Error('Hand Pose batch sequence 또는 timestamp가 올바르지 않습니다.');
    }
    const firstFrame = input.frames[0];
    const lastFrame = input.frames.at(-1);
    if (input.frames.length !== input.frameCount
      || firstFrame?.sequence !== input.firstSequence
      || lastFrame?.sequence !== input.lastSequence
      || input.frames.some((frame, index) => (
        index > 0 && frame.episodeOffsetMs < (input.frames[index - 1]?.episodeOffsetMs ?? 0)
      ))) {
      throw new Error('Hand Pose batch frame 이력과 receipt가 일치하지 않습니다.');
    }
    const previous = this.#handPoseMetrics.get(session.id);
    this.#handPoseMetrics.set(session.id, {
      firstDeviceTimestampMs: previous?.firstDeviceTimestampMs ?? input.deviceTimestampMs,
      lastDeviceTimestampMs: input.deviceTimestampMs,
      lastReceivedTimestampMs: input.receivedTimestampMs,
      frameCount: (previous?.frameCount ?? 0) + input.frameCount,
      byteLength: (previous?.byteLength ?? 0) + input.byteLength,
      leftPoseObserved: input.leftPoseObserved,
      rightPoseObserved: input.rightPoseObserved,
      leftSourcePresent: input.leftSourcePresent,
      rightSourcePresent: input.rightSourcePresent,
      leftLastObservedAtMs: input.leftPoseObserved
        ? input.receivedTimestampMs
        : previous?.leftLastObservedAtMs ?? null,
      rightLastObservedAtMs: input.rightPoseObserved
        ? input.receivedTimestampMs
        : previous?.rightLastObservedAtMs ?? null,
      latestHandPose: input.latestHandPose,
    });
    const previousFrames = this.#handPoseFrames.get(input.episodeId) ?? [];
    this.#handPoseFrames.set(input.episodeId, [...previousFrames, ...input.frames]);
    const streams = session.streams.map((stream) => (
      stream.sourceDeviceId === input.sourceDeviceId
        ? {
          ...stream,
          status: 'active' as const,
          observedRateHz: humanDemonstrationProfile.handTracking.targetRateHz,
          bytesWritten: stream.bytesWritten + Math.floor(input.byteLength / 2),
        }
        : stream
    ));
    this.#episodes = this.#episodes.map((episode) => episode.id === input.episodeId
      ? {
        ...episode,
        streams: episode.streams.map((stream) => stream.sourceDeviceId === input.sourceDeviceId
          ? {
            ...stream,
            status: 'active' as const,
            observedRateHz: humanDemonstrationProfile.handTracking.targetRateHz,
            bytesWritten: stream.bytesWritten + Math.floor(input.byteLength / 2),
          }
          : stream),
      }
      : episode);
    this.#replaceSession({ ...session, streams });
  }

  async reportHandPosePreview(input: HandPosePreviewInput): Promise<void> {
    const session = this.#requireHumanDemonstrationSession(input.sessionId);
    const source = session.humanDemonstration.sourceBindings.find(
      (item) => item.sourceDeviceId === input.sourceDeviceId,
    );
    if (source?.role !== 'xr-hand-tracking') {
      throw new Error('Hand Pose preview source binding이 일치하지 않습니다.');
    }
    if (input.deviceTimestampMs < 0 || input.receivedTimestampMs < 0) {
      throw new Error('Hand Pose preview timestamp가 올바르지 않습니다.');
    }
    this.#handPosePreviews.set(session.id, {
      coordinateFrame: input.coordinateFrame,
      deviceTimestampMs: input.deviceTimestampMs,
      receivedTimestampMs: input.receivedTimestampMs,
      hands: input.hands,
    });
    this.#notify();
  }

  async createMobilitySession(input: CreateMobilitySessionInput): Promise<MobilityCaptureSession> {
    this.#assertActive();
    const session: MobilityCaptureSession = {
      id: this.#nextId('capture-m'), projectId: input.projectId, siteId: input.siteId, name: input.name,
      kind: 'mobility', robotId: input.robotId, robotType: 'quadruped', sensorDeviceId: input.sensorDeviceId,
      provenance: { ...defaultProvenance, controlMode: 'autonomous' }, status: 'draft', createdAtMs: this.#clock.nowMs(),
      updatedAtMs: this.#clock.nowMs(), startedAtMs: null, stoppedAtMs: null, bytesWritten: 0, streams: copyStreams('waiting'), preflight: [], routeId: input.routeId,
      driveSessionId: null, interventionIds: [], chunkPolicy: { durationMs: 300_000, preBufferMs: input.preBufferMs, postBufferMs: input.postBufferMs },
      controlMode: 'autonomous',
    };
    this.#sessions = [session, ...this.#sessions];
    this.#notify();
    return clone(session);
  }

  async validateSession(id: string): Promise<FlywheelCaptureSession> {
    const session = this.#requireSession(id);
    if (!['draft', 'validating', 'failed', 'ready'].includes(session.status)) {
      throw new Error('설정 또는 확인 필요 상태의 세션만 점검할 수 있습니다.');
    }
    if (session.kind === 'humanoid' && session.humanDemonstration !== null) {
      const unavailableRequiredSources = session.humanDemonstration.sourceBindings.filter((source) => (
        source.required
        && source.state !== 'ready'
        && source.state !== 'recording'
      ));
      if (unavailableRequiredSources.length > 0) {
        const checks = this.#humanDemonstrationPreflight(session);
        this.#replaceSession({ ...session, status: 'draft', preflight: checks });
        throw new Error('필수 collector를 모두 연결한 뒤 다시 사전점검하세요.');
      }
    }
    const updated = {
      ...session,
      status: 'ready' as const,
      preflight: session.kind === 'humanoid' && session.humanDemonstration !== null
        ? this.#humanDemonstrationPreflight(session)
        : this.#passedPreflight(),
      streams: session.kind === 'humanoid' && session.humanDemonstration !== null
        ? humanDemonstrationStreams(session.humanDemonstration)
        : copyStreams('waiting'),
      ...(session.kind === 'humanoid' ? { errorMessage: null } : {}),
    };
    this.#replaceSession(updated);
    return clone(updated);
  }

  async startSession(id: string): Promise<FlywheelCaptureSession> {
    const session = this.#requireSession(id);
    if (session.status !== 'ready') throw new Error('사전점검을 통과한 세션만 시작할 수 있습니다.');
    const conflict = this.#sessions.find((item) => {
      if (item.id === session.id || (item.status !== 'active' && item.status !== 'recording')) return false;
      if (session.kind === 'humanoid' && session.humanDemonstration !== null) {
        return item.kind === 'humanoid'
          && item.humanDemonstration?.exoskeletonDeviceId === session.humanDemonstration.exoskeletonDeviceId;
      }
      return session.robotId !== null && item.robotId === session.robotId;
    });
    if (conflict !== undefined) {
      const resourceId = session.kind === 'humanoid' && session.humanDemonstration !== null
        ? session.humanDemonstration.exoskeletonDeviceId
        : session.robotId;
      throw new Error(`${resourceId ?? '수집 장치'}은(는) "${conflict.name}" 세션에서 사용 중입니다. /mlops/collection/${conflict.id}`);
    }
    const now = this.#clock.nowMs();
    if (session.kind === 'humanoid') {
      const updated: HumanoidCaptureSession = {
        ...session,
        status: 'active',
        startedAtMs: session.startedAtMs ?? now,
        streams: session.humanDemonstration === null
          ? copyStreams('active')
          : humanDemonstrationStreams(session.humanDemonstration, 'active'),
        errorMessage: null,
      };
      this.#replaceSession(updated);
      return clone(updated);
    }
    const driveId = this.#nextId('drive');
    const drive: DriveSession = {
      id: driveId, projectId: session.projectId, siteId: session.siteId, captureSessionId: session.id, robotId: session.robotId,
      routeId: session.routeId, status: 'recording', startedAtMs: now, endedAtMs: null, durationMs: 0, distanceMeters: 0,
      autonomyRatio: 1, chunks: [], interventionIds: [], qualityStatus: 'pending',
    };
    this.#drives = [drive, ...this.#drives];
    const updated: MobilityCaptureSession = { ...session, status: 'recording', startedAtMs: now, driveSessionId: driveId, streams: copyStreams('active') };
    this.#replaceSession(updated);
    return clone(updated);
  }

  async stopSession(id: string): Promise<FlywheelCaptureSession> {
    const session = this.#requireSession(id);
    if (session.status !== 'active' && session.status !== 'recording') {
      throw new Error('운영 중인 세션만 종료할 수 있습니다.');
    }
    const now = this.#clock.nowMs();
    if (session.kind === 'humanoid') {
      if (session.activeEpisodeId !== null) {
        const activeEpisode = this.#episodes.find((item) => item.id === session.activeEpisodeId);
        if (activeEpisode?.status === 'completed' && activeEpisode.outcome === null) {
          throw new Error('정지한 녹화본을 저장하거나 폐기한 뒤 세션을 종료하세요.');
        }
        await this.completeEpisode(session.activeEpisodeId, 'aborted');
      }
      const latest = this.#requireSession(id) as HumanoidCaptureSession;
      const savedEpisodes = this.#episodes.filter((item) =>
        item.captureSessionId === id
        && item.status === 'completed'
        && (item.outcome === null || item.outcome === 'success'));
      if (savedEpisodes.length === 0) {
        const abandoned: HumanoidCaptureSession = {
          ...latest,
          status: 'abandoned',
          stoppedAtMs: now,
          streams: latest.humanDemonstration === null
            ? copyStreams()
            : humanDemonstrationStreams(latest.humanDemonstration, 'stopped'),
          processingStage: null,
          errorMessage: null,
        };
        this.#replaceSession(abandoned);
        return clone(abandoned);
      }
      const updated: HumanoidCaptureSession = {
        ...latest,
        status: 'processing',
        stoppedAtMs: now,
        streams: latest.humanDemonstration === null
          ? copyStreams()
          : humanDemonstrationStreams(latest.humanDemonstration, 'stopped'),
        bytesWritten: savedEpisodes.reduce((sum, item) => sum + item.bytesWritten, 0),
        processingStage: 'finalizing-files',
        errorMessage: null,
      };
      this.#replaceSession(updated);
      this.#scheduleSessionProcessing(updated.id);
      return clone(updated);
    }
    const drive = this.#drives.find((item) => item.id === session.driveSessionId);
    if (drive === undefined) throw new Error('연결된 주행 세션을 찾을 수 없습니다.');
    const activeIntervention = this.#interventions.find((item) => item.driveSessionId === drive.id && item.endMs === null);
    if (activeIntervention !== undefined) {
      this.#interventions = this.#interventions.map((item) => item.id === activeIntervention.id
        ? { ...item, status: 'needs-review', endMs: now, outcome: 'stopped' }
        : item);
    }
    const durationMs = Math.max(1, now - drive.startedAtMs);
    const chunks = Array.from({ length: Math.max(1, Math.ceil(durationMs / session.chunkPolicy.durationMs)) }, (_, index) => ({
      id: this.#nextId('chunk'), startMs: drive.startedAtMs + index * session.chunkPolicy.durationMs,
      endMs: Math.min(now, drive.startedAtMs + (index + 1) * session.chunkPolicy.durationMs), bytesWritten: 720_000_000,
    }));
    this.#drives = this.#drives.map((item) => item.id === drive.id ? {
      ...item, status: 'completed', endedAtMs: now, durationMs, distanceMeters: Math.round(durationMs / 1000 * 0.8),
      autonomyRatio: item.interventionIds.length === 0 ? 1 : 0.92, chunks, qualityStatus: 'passed',
    } : item);
    const updated: MobilityCaptureSession = { ...session, status: 'completed', stoppedAtMs: now, controlMode: 'autonomous', streams: copyStreams(), bytesWritten: chunks.length * 720_000_000 };
    this.#replaceSession(updated);
    return clone(updated);
  }

  async startEpisode(sessionId: string, name?: string): Promise<FlywheelEpisode> {
    const session = this.#requireSession(sessionId);
    if (session.kind !== 'humanoid' || session.status !== 'active') throw new Error('시작된 휴머노이드 세션이 필요합니다.');
    if (session.activeEpisodeId !== null) {
      const active = this.#episodes.find((item) => item.id === session.activeEpisodeId);
      if (active !== undefined) return clone(active);
      throw new Error('동시에 둘 이상의 Episode를 기록할 수 없습니다.');
    }
    const sequence = session.episodeIds.length + 1;
    const acknowledgements: readonly CollectorAcknowledgement[] = session.humanDemonstration === null
      ? []
      : session.humanDemonstration.sourceBindings.flatMap((source) => {
        if (source.role === 'external-scene-camera' && source.state === 'offline') return [];
        return [{
          sessionId: session.id,
          episodeId: '',
          sourceDeviceId: source.sourceDeviceId,
          command: 'start' as const,
          state: source.role === 'xr-hand-tracking' ? 'pending' as const : 'acknowledged' as const,
          acknowledgedAtMs: source.role === 'xr-hand-tracking' ? null : this.#clock.nowMs(),
          detail: null,
        }];
      });
    const episodeId = this.#nextId('episode-fw');
    const humanDemonstration = session.humanDemonstration === null
      ? null
      : {
        ...session.humanDemonstration,
        collectorAcknowledgements: acknowledgements.map((item) => ({ ...item, episodeId })),
        sourceBindings: session.humanDemonstration.sourceBindings.map((source) => ({
          ...source,
          activeEpisodeId: source.role === 'xr-hand-tracking' ? null : episodeId,
          state: source.role === 'xr-hand-tracking' ? source.state : source.state === 'offline' ? 'offline' as const : 'recording' as const,
        })),
      };
    const episode: FlywheelEpisode = {
      id: episodeId, projectId: session.projectId, siteId: session.siteId, captureSessionId: session.id,
      name: name?.trim() || `Episode ${String(sequence).padStart(2, '0')}`, taskId: session.taskId, instruction: session.instruction, robotId: session.robotId,
      sensorDeviceId: session.sensorDeviceId, humanDemonstration,
      provenance: session.provenance, status: 'recording', outcome: null,
      startedAtMs: this.#clock.nowMs(), endedAtMs: null, bytesWritten: 0, annotationStatus: 'unassigned', qualityStatus: 'pending',
      qualityWarnings: [], finalizationError: null, events: [], streams: humanDemonstration === null
        ? copyStreams('active')
        : humanDemonstrationStreams(humanDemonstration, 'active'),
    };
    this.#episodes = [episode, ...this.#episodes];
    this.#replaceSession({
      ...session,
      activeEpisodeId: episode.id,
      episodeIds: [...session.episodeIds, episode.id],
      humanDemonstration,
      streams: episode.streams,
    });
    return clone(episode);
  }

  async stopEpisode(episodeId: string): Promise<FlywheelEpisode> {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    if (episode.status !== 'recording') return clone(episode);
    const now = this.#clock.nowMs();
    const updated: FlywheelEpisode = {
      ...episode,
      status: 'finalizing',
      endedAtMs: now,
      bytesWritten: Math.max(200_000_000, now - episode.startedAtMs) * 12,
      streams: episode.humanDemonstration === null
        ? copyStreams()
        : humanDemonstrationStreams(episode.humanDemonstration, 'stopped'),
    };
    this.#episodes = this.#episodes.map((item) => item.id === episodeId ? updated : item);
    const session = this.#sessions.find((item) => item.id === episode.captureSessionId);
    if (session?.kind === 'humanoid' && session.humanDemonstration !== null) {
      const stopAcknowledgements = session.humanDemonstration.sourceBindings.flatMap((source) => {
        if (source.role === 'external-scene-camera' && source.state === 'offline') return [];
        return [{
          sessionId: session.id,
          episodeId,
          sourceDeviceId: source.sourceDeviceId,
          command: 'stop' as const,
          state: source.role === 'xr-hand-tracking' ? 'pending' as const : 'acknowledged' as const,
          acknowledgedAtMs: source.role === 'xr-hand-tracking' ? null : now,
          detail: null,
        }];
      });
      const humanDemonstration: HumanDemonstrationBinding = {
        ...session.humanDemonstration,
        collectorAcknowledgements: [
          ...session.humanDemonstration.collectorAcknowledgements,
          ...stopAcknowledgements,
        ],
        sourceBindings: session.humanDemonstration.sourceBindings.map((source) => source.role === 'xr-hand-tracking'
          ? source
          : { ...source, activeEpisodeId: null, state: source.state === 'offline' ? 'offline' : 'ready' }),
      };
      this.#episodes = this.#episodes.map((item) => item.id === episodeId
        ? {
          ...item,
          humanDemonstration,
          streams: humanDemonstrationStreams(humanDemonstration, 'stopped'),
        }
        : item);
      this.#replaceSession({
        ...session,
        humanDemonstration,
        streams: humanDemonstrationStreams(humanDemonstration, 'stopped'),
      });
    } else {
      this.#notify();
    }
    this.#schedule(250, () => this.#finalizeEpisode(episodeId, null));
    return clone(updated);
  }

  async saveEpisode(episodeId: string): Promise<FlywheelEpisode> {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    if (episode.status !== 'completed' || episode.outcome !== null) {
      throw new Error('검토가 끝난 녹화본만 저장할 수 있습니다.');
    }
    const session = this.#requireSession(episode.captureSessionId);
    if (
      session.kind !== 'humanoid'
      || session.status !== 'active'
      || session.activeEpisodeId !== episodeId
    ) {
      throw new Error('현재 검토 중인 녹화본만 저장할 수 있습니다.');
    }
    this.#replaceSession({ ...session, activeEpisodeId: null });
    return clone(episode);
  }

  async deleteEpisode(episodeId: string): Promise<void> {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    const session = this.#requireSession(episode.captureSessionId);
    if (
      session.kind !== 'humanoid'
      || session.status !== 'active'
      || session.activeEpisodeId !== episodeId
      || (
        episode.status !== 'recording'
        && !(episode.status === 'completed' && episode.outcome === null)
      )
    ) {
      throw new Error('현재 녹화 중이거나 검토 중인 Episode만 폐기할 수 있습니다.');
    }
    this.#episodes = this.#episodes.filter((item) => item.id !== episodeId);
    this.#handPoseFrames.delete(episodeId);
    this.#replaceSession({
      ...session,
      activeEpisodeId: null,
      episodeIds: session.episodeIds.filter((id) => id !== episodeId),
    });
  }

  async setEpisodeOutcome(episodeId: string, outcome: 'success' | 'failure'): Promise<FlywheelEpisode> {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    if (episode.status !== 'completed') throw new Error('저장이 완료된 Episode에만 결과를 입력할 수 있습니다.');
    const updated: FlywheelEpisode = { ...episode, outcome };
    this.#episodes = this.#episodes.map((item) => item.id === episodeId ? updated : item);
    const session = this.#sessions.find((item) => item.id === episode.captureSessionId);
    if (session?.kind === 'humanoid' && session.activeEpisodeId === episodeId) {
      this.#replaceSession({ ...session, activeEpisodeId: null });
    } else {
      this.#notify();
    }
    return clone(updated);
  }

  async retryEpisodeFinalization(episodeId: string): Promise<FlywheelEpisode> {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    if (episode.status !== 'finalizing' || episode.finalizationError === null) {
      throw new Error('다시 저장할 수 있는 Episode가 아닙니다.');
    }
    const updated: FlywheelEpisode = { ...episode, finalizationError: null };
    this.#episodes = this.#episodes.map((item) => item.id === episodeId ? updated : item);
    this.#notify();
    this.#schedule(250, () => this.#finalizeEpisode(episodeId, null));
    return clone(updated);
  }

  async invalidateEpisode(episodeId: string): Promise<FlywheelEpisode> {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    if (episode.status !== 'finalizing' || episode.finalizationError === null) {
      throw new Error('저장 실패한 Episode만 제외할 수 있습니다.');
    }
    const updated: FlywheelEpisode = {
      ...episode,
      status: 'invalid',
      qualityStatus: 'quarantined',
      qualityWarnings: [...episode.qualityWarnings, 'Episode finalization failed'],
    };
    this.#episodes = this.#episodes.map((item) => item.id === episodeId ? updated : item);
    const session = this.#requireSession(episode.captureSessionId);
    if (session.kind === 'humanoid') this.#replaceSession({ ...session, activeEpisodeId: null });
    this.#notify();
    return clone(updated);
  }

  async completeEpisode(episodeId: string, outcome: 'success' | 'failure' | 'aborted'): Promise<FlywheelEpisode> {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    if (episode.status === 'completed') {
      const updated = { ...episode, outcome };
      this.#episodes = this.#episodes.map((item) => item.id === episodeId ? updated : item);
      const session = this.#sessions.find((item) => item.id === episode.captureSessionId);
      if (session?.kind === 'humanoid' && session.activeEpisodeId === episodeId) {
        this.#replaceSession({ ...session, activeEpisodeId: null });
      } else {
        this.#notify();
      }
      return clone(updated);
    }
    if (episode.status !== 'recording' && episode.status !== 'finalizing') {
      throw new Error('저장 가능한 Episode가 아닙니다.');
    }
    return clone(this.#finalizeEpisode(episodeId, outcome));
  }

  async retrySessionProcessing(sessionId: string): Promise<HumanoidCaptureSession> {
    const session = this.#requireSession(sessionId);
    if (session.kind !== 'humanoid' || session.status !== 'failed') {
      throw new Error('다시 처리할 수 있는 세션이 아닙니다.');
    }
    const hasSavedEpisode = this.#episodes.some((item) =>
      item.captureSessionId === sessionId && item.status === 'completed');
    if (!hasSavedEpisode) throw new Error('저장된 Episode가 없어 처리할 수 없습니다.');
    const updated: HumanoidCaptureSession = {
      ...session,
      status: 'processing',
      processingStage: 'finalizing-files',
      errorMessage: null,
    };
    this.#replaceSession(updated);
    this.#scheduleSessionProcessing(sessionId);
    return clone(updated);
  }

  async abandonSession(sessionId: string): Promise<HumanoidCaptureSession> {
    const session = this.#requireSession(sessionId);
    if (session.kind !== 'humanoid') throw new Error('휴머노이드 세션만 폐기할 수 있습니다.');
    if (session.activeEpisodeId !== null || session.status === 'processing' || session.status === 'completed') {
      throw new Error('현재 상태에서는 세션을 폐기할 수 없습니다.');
    }
    const updated: HumanoidCaptureSession = {
      ...session,
      status: 'abandoned',
      stoppedAtMs: this.#clock.nowMs(),
      processingStage: null,
      errorMessage: null,
      streams: session.humanDemonstration === null
        ? copyStreams()
        : humanDemonstrationStreams(session.humanDemonstration, 'stopped'),
    };
    this.#replaceSession(updated);
    return clone(updated);
  }

  async reportStreamFailure(sessionId: string, streamId: string, required: boolean): Promise<HumanoidCaptureSession> {
    const session = this.#requireSession(sessionId);
    if (session.kind !== 'humanoid' || session.status !== 'active') {
      throw new Error('운영 중인 휴머노이드 세션이 필요합니다.');
    }
    const failedStream = session.streams.find((stream) => stream.id === streamId);
    const streams = session.streams.map((stream) => (
      stream.id === streamId
      || (typeof failedStream?.sourceDeviceId === 'string' && stream.sourceDeviceId === failedStream.sourceDeviceId)
        ? { ...stream, status: 'stale' as const }
        : stream
    ));
    const streamLabel = failedStream?.displayName ?? streamId;
    if (session.humanDemonstration !== null) {
      if (session.activeEpisodeId !== null) {
        this.#episodes = this.#episodes.map((item) => item.id === session.activeEpisodeId
          ? { ...item, qualityWarnings: [...item.qualityWarnings, `${streamLabel} stream disconnected`] }
          : item);
      }
      const sourceDeviceId = session.streams.find((stream) => stream.id === streamId)?.sourceDeviceId ?? null;
      const humanDemonstration: HumanDemonstrationBinding = {
        ...session.humanDemonstration,
        sourceBindings: session.humanDemonstration.sourceBindings.map((source) => source.sourceDeviceId === sourceDeviceId
          ? { ...source, state: 'offline' }
          : source),
      };
      const updated: HumanoidCaptureSession = {
        ...session,
        humanDemonstration,
        streams,
        errorMessage: required
          ? '필수 source 연결이 끊겼습니다. 다른 source 수집은 계속되며 Episode는 품질 검토가 필요합니다.'
          : session.errorMessage,
      };
      this.#replaceSession(updated);
      return clone(updated);
    }
    if (session.activeEpisodeId !== null) {
      const episode = this.#episodes.find((item) => item.id === session.activeEpisodeId);
      if (episode !== undefined && !required) {
        this.#episodes = this.#episodes.map((item) => item.id === episode.id ? {
          ...item,
          qualityWarnings: [...item.qualityWarnings, `${streamLabel} stream degraded`],
        } : item);
      }
      if (required) await this.completeEpisode(session.activeEpisodeId, 'aborted');
    }
    const latest = this.#requireSession(sessionId) as HumanoidCaptureSession;
    const updated: HumanoidCaptureSession = required
      ? { ...latest, status: 'failed', streams, errorMessage: '필수 스트림 연결이 끊겼습니다. 재점검 후 계속하세요.' }
      : { ...latest, streams };
    this.#replaceSession(updated);
    return clone(updated);
  }

  simulateEpisodeFinalizationFailure(episodeId: string): void {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined || (episode.status !== 'recording' && episode.status !== 'finalizing')) {
      throw new Error('저장 실패를 재현할 수 있는 Episode가 아닙니다.');
    }
    const now = this.#clock.nowMs();
    const updated: FlywheelEpisode = {
      ...episode,
      status: 'finalizing',
      endedAtMs: episode.endedAtMs ?? now,
      bytesWritten: episode.bytesWritten || Math.max(200_000_000, now - episode.startedAtMs) * 12,
      finalizationError: '파일 확정에 실패했습니다.',
      streams: episode.humanDemonstration === null
        ? copyStreams()
        : humanDemonstrationStreams(episode.humanDemonstration, 'stopped'),
    };
    this.#episodes = this.#episodes.map((item) => item.id === episodeId ? updated : item);
    this.#notify();
  }

  simulateSessionProcessingFailure(sessionId: string): void {
    const session = this.#requireSession(sessionId);
    if (session.kind !== 'humanoid' || session.status !== 'processing') {
      throw new Error('처리 실패를 재현할 수 있는 세션이 아닙니다.');
    }
    this.#replaceSession({
      ...session,
      status: 'failed',
      processingStage: null,
      errorMessage: '카탈로그 인덱싱에 실패했습니다.',
    });
  }

  async setMobilityControlMode(sessionId: string, mode: MobilityCaptureSession['controlMode']): Promise<MobilityCaptureSession> {
    const session = this.#requireSession(sessionId);
    if (session.kind !== 'mobility' || session.status !== 'recording' || session.driveSessionId === null) {
      throw new Error('기록 중인 주행 세션이 필요합니다.');
    }
    const now = this.#clock.nowMs();
    const drive = this.#drives.find((item) => item.id === session.driveSessionId);
    if (drive === undefined) throw new Error('주행 세션을 찾을 수 없습니다.');
    let interventionIds = session.interventionIds;
    if (session.controlMode === 'autonomous' && mode !== 'autonomous') {
      const intervention: InterventionEvent = {
        id: this.#nextId('intervention'), projectId: session.projectId, siteId: session.siteId, driveSessionId: drive.id, robotId: session.robotId,
        status: 'detected', trigger: 'control-transition', startMs: Math.max(drive.startedAtMs, now - session.chunkPolicy.preBufferMs),
        controlReturnedAtMs: null, endMs: null, reason: 'unknown', severity: 'medium', outcome: 'pending', note: '', qualityStatus: 'pending',
      };
      this.#interventions = [intervention, ...this.#interventions];
      interventionIds = [...interventionIds, intervention.id];
      this.#drives = this.#drives.map((item) => item.id === drive.id ? { ...item, interventionIds: [...item.interventionIds, intervention.id] } : item);
    } else if (session.controlMode !== 'autonomous' && mode === 'autonomous') {
      const active = this.#interventions.find((item) => item.driveSessionId === drive.id && item.endMs === null);
      if (active !== undefined) {
        this.#interventions = this.#interventions.map((item) => item.id === active.id ? {
          ...item, status: 'needs-review', controlReturnedAtMs: now, endMs: now + session.chunkPolicy.postBufferMs, outcome: 'recovered',
        } : item);
      }
    }
    const updated: MobilityCaptureSession = { ...session, controlMode: mode, interventionIds };
    this.#replaceSession(updated);
    return clone(updated);
  }

  async updateIntervention(id: string, input: Pick<InterventionEvent, 'startMs' | 'endMs' | 'reason' | 'severity' | 'outcome' | 'note'>): Promise<InterventionEvent> {
    const current = this.#interventions.find((item) => item.id === id);
    if (current === undefined) throw new Error('Intervention Event를 찾을 수 없습니다.');
    const drive = this.#drives.find((item) => item.id === current.driveSessionId);
    if (drive === undefined) throw new Error('연결된 주행 세션을 찾을 수 없습니다.');
    const maximumEnd = drive.endedAtMs ?? this.#clock.nowMs();
    if (input.startMs < drive.startedAtMs || input.endMs === null || input.endMs > maximumEnd || input.endMs <= input.startMs) {
      throw new Error('Intervention 경계는 주행 구간 안에서 올바른 순서로 지정해야 합니다.');
    }
    const updated: InterventionEvent = { ...current, ...input, status: 'reviewed' };
    this.#interventions = this.#interventions.map((item) => item.id === id ? updated : item);
    this.#notify();
    return clone(updated);
  }

  async createAnnotationTask(input: Omit<AnnotationTask, 'id' | 'status' | 'completedItems'>): Promise<AnnotationTask> {
    const task: AnnotationTask = { ...input, id: this.#nextId('annotation'), status: 'assigned', completedItems: 0 };
    this.#annotations = [task, ...this.#annotations];
    this.#notify();
    return clone(task);
  }

  async updateAnnotationTask(id: string, input: Pick<AnnotationTask, 'description' | 'status' | 'completedItems'>): Promise<AnnotationTask> {
    const current = this.#annotations.find((item) => item.id === id);
    if (current === undefined) throw new Error('Annotation Task를 찾을 수 없습니다.');
    const updated = { ...current, ...input, completedItems: Math.min(current.totalItems, Math.max(0, input.completedItems)) };
    this.#annotations = this.#annotations.map((item) => item.id === id ? updated : item);
    this.#notify();
    return clone(updated);
  }

  async runQualityCheck(dataKind: DataUnitKind): Promise<QualityRun> {
    const total = dataKind === 'humanoid-episode' ? this.#episodes.length : dataKind === 'drive-window' ? this.#drives.length : this.#interventions.length;
    const run: QualityRun = {
      id: this.#nextId('quality'), projectId: 'project-tiger', name: `${dataKind} quality check`, ruleSetId: 'rules-vla-default', dataKind,
      status: 'completed', passedItems: Math.max(0, total - 1), failedItems: total === 0 ? 0 : 1, quarantinedItems: 0,
      issues: total === 0 ? [] : ['Observed rate below requested rate'], createdAtMs: this.#clock.nowMs(),
    };
    this.#qualityRuns = [run, ...this.#qualityRuns];
    this.#notify();
    return clone(run);
  }

  async createDataset(input: CreateDatasetVersionInput): Promise<DatasetVersion> {
    this.#validateDatasetReferences(input.kind, input.unitRefs, input.projectId);
    const dataset: DatasetVersion = {
      ...input, id: this.#nextId('dataset'), familyId: this.#nextId('family'), version: 1, status: 'draft',
      split: { train: 80, validation: 10, test: 10 }, createdAtMs: this.#clock.nowMs(), updatedAtMs: this.#clock.nowMs(), validation: [],
    };
    this.#datasets = [dataset, ...this.#datasets];
    this.#notify();
    return clone(dataset);
  }

  async releaseDataset(id: string): Promise<DatasetVersion> {
    const current = this.#datasets.find((item) => item.id === id);
    if (current === undefined) throw new Error('Dataset Version을 찾을 수 없습니다.');
    this.#validateDatasetReferences(current.kind, current.unitRefs, current.projectId);
    const updated: DatasetVersion = { ...current, status: 'released', updatedAtMs: this.#clock.nowMs(), validation: [] };
    this.#datasets = this.#datasets.map((item) => item.id === id ? updated : item);
    this.#notify();
    return clone(updated);
  }

  async createTrainingRun(input: CreateTrainingRunInput): Promise<TrainingRun> {
    const dataset = this.#datasets.find((item) => item.id === input.datasetVersionId);
    if (dataset?.status !== 'released') throw new Error('Released Dataset Version만 학습에 사용할 수 있습니다.');
    const run: TrainingRun = {
      ...input, id: this.#nextId('training'), status: 'queued', currentStep: 0, metrics: [], logs: ['Training job queued'],
      checkpoints: [], createdAtMs: this.#clock.nowMs(), modelVersionId: null,
    };
    this.#trainingRuns = [run, ...this.#trainingRuns];
    this.#notify();
    this.#schedule(350, () => this.#advanceTraining(run.id, 'running'));
    this.#schedule(1_100, () => this.#advanceTraining(run.id, 'progress'));
    this.#schedule(2_000, () => this.#advanceTraining(run.id, 'succeeded'));
    return clone(run);
  }

  async cancelTrainingRun(id: string): Promise<TrainingRun> {
    const current = this.#trainingRuns.find((item) => item.id === id);
    if (current === undefined) throw new Error('Training Run을 찾을 수 없습니다.');
    if (current.status === 'succeeded' || current.status === 'failed') throw new Error('종료된 Training Run은 취소할 수 없습니다.');
    const updated: TrainingRun = { ...current, status: 'cancelled', logs: [...current.logs, 'Cancelled by operator'] };
    this.#trainingRuns = this.#trainingRuns.map((item) => item.id === id ? updated : item);
    this.#notify();
    return clone(updated);
  }

  async createEvaluationRun(input: CreateEvaluationRunInput): Promise<EvaluationRun> {
    if (!this.#models.some((item) => item.id === input.modelVersionId)) throw new Error('Model Version을 찾을 수 없습니다.');
    const run: EvaluationRun = {
      ...input, id: this.#nextId('evaluation'), baselineModelVersionId: null, status: 'queued', score: null, metrics: [], createdAtMs: this.#clock.nowMs(),
    };
    this.#evaluations = [run, ...this.#evaluations];
    this.#notify();
    this.#schedule(400, () => this.#advanceEvaluation(run.id, false));
    this.#schedule(1_500, () => this.#advanceEvaluation(run.id, true));
    return clone(run);
  }

  async updateModelStage(id: string, stage: ModelVersion['stage']): Promise<ModelVersion> {
    const current = this.#models.find((item) => item.id === id);
    if (current === undefined) throw new Error('Model Version을 찾을 수 없습니다.');
    if (stage === 'production' && !this.#evaluations.some((item) => item.modelVersionId === id && item.status === 'passed')) {
      throw new Error('통과한 Evaluation이 있어야 Production으로 승격할 수 있습니다.');
    }
    const updated: ModelVersion = { ...current, stage };
    this.#models = this.#models.map((item) => item.id === id ? updated : item);
    this.#notify();
    return clone(updated);
  }

  async createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
    const model = this.#models.find((item) => item.id === input.modelVersionId);
    if (model?.stage !== 'production') throw new Error('Production Model Version만 배포할 수 있습니다.');
    const deployment: Deployment = {
      ...input, id: this.#nextId('deployment'), status: 'deploying', latencyMs: null, actionRateHz: null, createdAtMs: this.#clock.nowMs(),
    };
    this.#deployments = [deployment, ...this.#deployments];
    this.#notify();
    this.#schedule(1_200, () => this.#activateDeployment(deployment.id));
    return clone(deployment);
  }

  async rollbackDeployment(id: string): Promise<Deployment> {
    const current = this.#deployments.find((item) => item.id === id);
    if (current === undefined) throw new Error('Deployment를 찾을 수 없습니다.');
    const updated: Deployment = { ...current, status: 'rolling-back' };
    this.#deployments = this.#deployments.map((item) => item.id === id ? updated : item);
    this.#notify();
    this.#schedule(700, () => {
      this.#deployments = this.#deployments.map((item) => item.id === id ? { ...item, status: 'rolled-back', rolloutPercent: 0 } : item);
      this.#notify();
    });
    return clone(updated);
  }

  getOverview(): Promise<FlywheelOverview> {
    const ratedEpisodes = this.#episodes.filter((item) =>
      item.status === 'completed' && (item.outcome === 'success' || item.outcome === 'failure'));
    const successfulEpisodes = ratedEpisodes.filter((item) => item.outcome === 'success');
    const totalDistance = this.#drives.reduce((sum, item) => sum + item.distanceMeters, 0);
    const passedQuality = [...this.#episodes, ...this.#drives, ...this.#interventions].filter((item) => item.qualityStatus === 'passed').length;
    const totalQuality = this.#episodes.length + this.#drives.length + this.#interventions.length;
    return Promise.resolve({
      episodeCount: this.#episodes.length,
      driveHours: this.#drives.reduce((sum, item) => sum + item.durationMs, 0) / 3_600_000,
      validDataPercent: totalQuality === 0 ? 0 : passedQuality / totalQuality * 100,
      taskSuccessPercent: ratedEpisodes.length === 0 ? 0 : successfulEpisodes.length / ratedEpisodes.length * 100,
      autonomyPercent: this.#drives.length === 0 ? 0 : this.#drives.reduce((sum, item) => sum + item.autonomyRatio, 0) / this.#drives.length * 100,
      interventionsPerKm: totalDistance === 0 ? 0 : this.#interventions.length / (totalDistance / 1000),
      releasedDatasetCount: this.#datasets.filter((item) => item.status === 'released').length,
      activeDeploymentCount: this.#deployments.filter((item) => item.status === 'active').length,
    });
  }

  listFailureClusters(): Promise<readonly FailureCluster[]> {
    const failedInferences = this.#inferences.filter((item) => item.outcome === 'failure' || item.outcome === 'intervention');
    return Promise.resolve([
      { id: 'failure-obstacle', title: '좁은 통로의 임시 장애물', cause: 'Perception과 local planning의 불일치', count: Math.max(4, failedInferences.length), severity: 'high', affectedRobotType: 'quadruped', recommendedCollectionCount: 120, relatedInferenceIds: failedInferences.map((item) => item.id) },
      { id: 'failure-grasp', title: '반사 재질 파지 실패', cause: 'Grasp pose confidence 저하', count: 7, severity: 'medium', affectedRobotType: 'humanoid', recommendedCollectionCount: 80, relatedInferenceIds: [] },
    ]);
  }

  getLineage(): Promise<{ readonly nodes: readonly LineageNode[]; readonly edges: readonly LineageEdge[] }> {
    const nodes: LineageNode[] = [
      ...this.#sessions.map((item) => ({ id: item.id, type: 'capture' as const, label: item.name, detailPath: `/mlops/sessions/${item.id}`, status: item.status })),
      ...this.#episodes.map((item) => ({ id: item.id, type: 'episode' as const, label: item.name, detailPath: `/mlops/episodes/${item.id}`, status: item.status })),
      ...this.#drives.map((item) => ({ id: item.id, type: 'drive' as const, label: item.routeId, detailPath: `/mlops/drives/${item.id}`, status: item.status })),
      ...this.#interventions.map((item) => ({ id: item.id, type: 'intervention' as const, label: `Intervention ${item.id}`, detailPath: `/mlops/interventions/${item.id}`, status: item.status })),
      ...this.#datasets.map((item) => ({ id: item.id, type: 'dataset' as const, label: `${item.name} v${String(item.version)}`, detailPath: `/mlops/datasets/${item.id}`, status: item.status })),
      ...this.#trainingRuns.map((item) => ({ id: item.id, type: 'training' as const, label: item.name, detailPath: `/mlops/training/${item.id}`, status: item.status })),
      ...this.#models.map((item) => ({ id: item.id, type: 'model' as const, label: `${item.name} v${String(item.version)}`, detailPath: `/mlops/models/${item.id}`, status: item.stage })),
      ...this.#evaluations.map((item) => ({ id: item.id, type: 'evaluation' as const, label: item.name, detailPath: `/mlops/evaluations/${item.id}`, status: item.status })),
      ...this.#deployments.map((item) => ({ id: item.id, type: 'deployment' as const, label: item.name, detailPath: `/mlops/deployments/${item.id}`, status: item.status })),
      ...this.#inferences.map((item) => ({ id: item.id, type: 'inference' as const, label: item.task, detailPath: `/mlops/inference/${item.id}`, status: item.status })),
    ];
    const edges: LineageEdge[] = [];
    this.#episodes.forEach((item) => edges.push({ id: `${item.captureSessionId}-${item.id}`, sourceId: item.captureSessionId, targetId: item.id }));
    this.#drives.forEach((item) => edges.push({ id: `${item.captureSessionId}-${item.id}`, sourceId: item.captureSessionId, targetId: item.id }));
    this.#interventions.forEach((item) => edges.push({ id: `${item.driveSessionId}-${item.id}`, sourceId: item.driveSessionId, targetId: item.id }));
    this.#datasets.forEach((dataset) => dataset.unitRefs.forEach((ref, index) => {
      const sourceId = ref.kind === 'episode' ? ref.episodeId : ref.kind === 'drive-window' ? ref.driveSessionId : ref.interventionId;
      edges.push({ id: `${sourceId}-${dataset.id}-${String(index)}`, sourceId, targetId: dataset.id });
    }));
    this.#trainingRuns.forEach((item) => edges.push({ id: `${item.datasetVersionId}-${item.id}`, sourceId: item.datasetVersionId, targetId: item.id }));
    this.#models.forEach((item) => edges.push({ id: `${item.trainingRunId}-${item.id}`, sourceId: item.trainingRunId, targetId: item.id }));
    this.#evaluations.forEach((item) => edges.push({ id: `${item.modelVersionId}-${item.id}`, sourceId: item.modelVersionId, targetId: item.id }));
    this.#deployments.forEach((item) => edges.push({ id: `${item.modelVersionId}-${item.id}`, sourceId: item.modelVersionId, targetId: item.id }));
    this.#inferences.forEach((item) => edges.push({ id: `${item.deploymentId}-${item.id}`, sourceId: item.deploymentId, targetId: item.id }));
    return Promise.resolve({ nodes: clone(nodes), edges: clone(edges) });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getEpisodeHandPoseAt(
    episodeId: string,
    offsetMs: number,
  ): Promise<CollectionHandPoseFrame | null> {
    if (!Number.isFinite(offsetMs) || offsetMs < 0) return Promise.resolve(null);
    const frames = this.#handPoseFrames.get(episodeId) ?? [];
    let low = 0;
    let high = frames.length - 1;
    let match: CollectionHandPoseFrame | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const frame = frames[middle];
      if (frame === undefined) break;
      if (frame.episodeOffsetMs <= offsetMs) {
        match = frame;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return Promise.resolve(clone(match));
  }

  subscribeCollectionTelemetry(_sessionId: string, listener: () => void): () => void {
    const unsubscribe = this.subscribe(listener);
    const timer = setInterval(listener, 1_000);
    this.#timers.add(timer);
    return () => {
      unsubscribe();
      clearInterval(timer);
      this.#timers.delete(timer);
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#syncUnsubscribe?.();
    this.#syncUnsubscribe = null;
    this.#timers.forEach((timer) => clearTimeout(timer));
    this.#timers.clear();
    this.#listeners.clear();
    this.#handPoseMetrics.clear();
    this.#handPoseFrames.clear();
    this.#handPosePreviews.clear();
  }

  #getHumanDemonstrationTelemetry(
    session: HumanoidCaptureSession,
  ): CollectionTelemetrySnapshot {
    if (session.humanDemonstration === null) {
      throw new Error('Human Demonstration telemetry에는 source binding이 필요합니다.');
    }
    const humanDemonstration = session.humanDemonstration;
    const observedAtMs = this.#clock.nowMs();
    const metrics = this.#handPoseMetrics.get(session.id) ?? null;
    const preview = this.#handPosePreviews.get(session.id) ?? null;
    const latestHandPose = metrics === null
      ? preview
      : preview === null || metrics.latestHandPose.receivedTimestampMs >= preview.receivedTimestampMs
        ? metrics.latestHandPose
        : preview;
    const activeEpisode = session.activeEpisodeId === null
      ? null
      : this.#episodes.find((item) => item.id === session.activeEpisodeId) ?? null;
    const isOperational = session.status === 'active' || session.status === 'recording';
    const elapsedMs = activeEpisode === null
      ? Math.max(0, (session.stoppedAtMs ?? observedAtMs) - (session.startedAtMs ?? observedAtMs))
      : Math.max(0, (activeEpisode.endedAtMs ?? observedAtMs) - activeEpisode.startedAtMs);
    const rateHz = metrics === null || metrics.frameCount < 2
      || metrics.lastDeviceTimestampMs <= metrics.firstDeviceTimestampMs
      ? null
      : (metrics.frameCount - 1) * 1_000
        / (metrics.lastDeviceTimestampMs - metrics.firstDeviceTimestampMs);
    const profile = humanDemonstration.profile;
    const streams: readonly CollectionStreamTelemetry[] = profile.streams.map((policy) => {
      const source = policy.sourceRole === null
        ? null
        : humanDemonstration.sourceBindings.find((item) => item.role === policy.sourceRole) ?? null;
      const derived = policy.origin === 'derived';
      const sourceReachable = source !== null
        && (source.state === 'ready' || source.state === 'recording' || source.state === 'stale');
      const hand = policy.streamId === 'quest-hand-left'
        ? 'left' as const
        : policy.streamId === 'quest-hand-right'
          ? 'right' as const
          : null;
      const poseObserved = hand === null
        ? false
        : latestHandPose?.hands[hand].poseObserved ?? false;
      const sourcePresent = hand === null
        ? sourceReachable
        : latestHandPose?.hands[hand].sourcePresent ?? sourceReachable;
      const lastPoseAtMs = hand === null
        ? null
        : poseObserved
          ? latestHandPose?.receivedTimestampMs ?? null
          : metrics?.[hand === 'left' ? 'leftLastObservedAtMs' : 'rightLastObservedAtMs'] ?? null;
      const consecutiveMissingMs = poseObserved
        ? 0
        : lastPoseAtMs === null
          ? elapsedMs
          : Math.max(0, observedAtMs - lastPoseAtMs);
      const qualityState = poseObserved
        ? 'tracking' as const
        : consecutiveMissingMs >= profile.handTracking.lostAfterMs
          ? 'lost' as const
          : 'partial' as const;
      const sourceOffline = !sourceReachable;
      const handDegraded = hand !== null && isOperational && (!poseObserved || !sourcePresent);
      const connectionState = derived
        ? 'offline' as const
        : sourceOffline
          ? 'offline' as const
          : source?.state === 'stale' || handDegraded
            ? 'stale' as const
            : 'live' as const;
      const health = derived
        ? 'healthy' as const
        : connectionState === 'offline'
          ? 'disconnected' as const
          : connectionState === 'stale'
            ? 'degraded' as const
            : 'healthy' as const;
      const sampleCount = hand === null
        ? Math.floor(elapsedMs / 1_000 * (policy.targetRateHz ?? 0))
        : metrics?.frameCount ?? 0;
      const sourceStream = session.streams.find((stream) => stream.id === policy.streamId);
      return {
        streamId: policy.streamId,
        displayName: policy.displayName,
        modality: policy.modality,
        required: policy.required,
        health,
        connectionState,
        expectedRateHz: policy.targetRateHz,
        observedRateHz: derived || connectionState === 'offline'
          ? null
          : hand === null ? sourceStream?.observedRateHz ?? policy.targetRateHz : rateHz,
        // 장치 monotonic clock과 Backend wall clock 사이 offset이 없으므로 지연을 발명하지 않는다.
        latencyMs: null,
        driftMs: hand === null && !derived && connectionState !== 'offline' ? 12 : null,
        sampleCount,
        droppedFrameCount: 0,
        missingSampleCount: handDegraded ? Math.max(1, Math.floor(consecutiveMissingMs / 34)) : 0,
        bytesWritten: sourceStream?.bytesWritten ?? 0,
        lastSampleAtMs: hand === null
          ? sourceReachable ? observedAtMs : source?.lastSeenAtMs ?? null
          : lastPoseAtMs,
        origin: policy.origin,
        sourceDeviceId: source?.sourceDeviceId ?? null,
        coordinateFrame: policy.coordinateFrame,
        processingStatus: derived ? sourceStream?.processingStatus ?? 'pending' : null,
        handTracking: hand === null ? null : {
          qualityState,
          poseObserved,
          sourcePresent,
          consecutiveMissingMs,
          validJointCount: poseObserved ? 25 : 0,
        },
      };
    });
    const requiredStreams = streams.filter((stream) => stream.required && stream.origin !== 'derived');
    const disconnected = requiredStreams.filter((stream) => stream.health === 'disconnected');
    const degraded = requiredStreams.filter((stream) => stream.health === 'degraded');
    const hasCapturedData = (metrics?.frameCount ?? 0) > 0 || session.bytesWritten > 0;
    const maxDriftMs = streams.reduce<number | null>((maximum, stream) => (
      stream.driftMs === null ? maximum : Math.max(maximum ?? 0, stream.driftMs)
    ), null);
    const qualityIssues = [
      ...disconnected.map((stream) => ({
        id: `disconnected-${stream.streamId}`,
        severity: 'critical' as const,
        streamId: stream.streamId,
        message: `필수 ${stream.displayName} source가 오프라인입니다. 다른 source 수집은 계속됩니다.`,
      })),
      ...degraded.map((stream) => ({
        id: `degraded-${stream.streamId}`,
        severity: 'warning' as const,
        streamId: stream.streamId,
        message: stream.modality === 'hand-pose'
          ? `${stream.displayName} pose가 현재 관측되지 않아 시간 기반 품질 검토가 필요합니다.`
          : `${stream.displayName} 수신이 지연되고 있습니다.`,
      })),
      ...(hasCapturedData || activeEpisode === null ? [] : [{
        id: 'no-hand-pose-data',
        severity: 'warning' as const,
        streamId: null,
        message: '현재 Episode에서 수신한 Hand Pose frame이 없습니다.',
      }]),
      {
        id: 'calibration-policy-pending',
        severity: 'warning' as const,
        streamId: null,
        message: 'Quest local-floor와 Exoskeleton body 사이 calibration 정책이 확정되지 않았습니다.',
      },
    ];
    const timelineTracks: readonly CollectionTimelineTrack[] = streams
      .filter((stream) => stream.origin !== 'derived')
      .map((stream) => ({
        streamId: stream.streamId,
        label: stream.displayName,
        health: stream.health,
        anomalies: stream.health === 'healthy' ? [] : [{
          startOffsetMs: -Math.min(10_000, Math.max(250, stream.handTracking?.consecutiveMissingMs ?? 1_000)),
          endOffsetMs: 0,
          kind: stream.health === 'disconnected' ? 'missing' as const : 'drop' as const,
          severity: stream.health === 'disconnected' ? 'critical' as const : 'warning' as const,
          label: stream.health === 'disconnected' ? 'source offline' : 'pose/frame missing',
        }],
      }));
    const totalSampleCount = streams.reduce((total, stream) => total + stream.sampleCount, 0);
    const qualityVerdict = disconnected.length > 0
      ? 'not-ready' as const
      : !hasCapturedData
        ? 'not-ready' as const
        : degraded.length > 0
          ? 'review' as const
          : 'review' as const;
    return {
      sessionId: session.id,
      activeEpisodeId: session.activeEpisodeId,
      observedAtMs,
      freshness: { staleAfterMs: 5_000, offlineAfterMs: 15_000 },
      connectionState: disconnected.length > 0
        ? 'offline'
        : degraded.length > 0 ? 'stale' : 'live',
      elapsedMs,
      totalSampleCount,
      bytesWritten: session.streams.reduce((total, stream) => total + stream.bytesWritten, 0),
      completenessPercent: !hasCapturedData
        ? 0
        : disconnected.length > 0 ? 76 : degraded.length > 0 ? 94 : 99.4,
      // Calibration 미확정 상태에서는 raw stream이 정상이어도 training-ready로 승격하지 않는다.
      qualityVerdict,
      qualityIssues,
      sync: {
        state: disconnected.length > 0 ? 'out-of-sync' : degraded.length > 0 ? 'warning' : 'unavailable',
        toleranceMs: 50,
        maxDriftMs,
      },
      streams,
      timeline: { windowMs: 10_000, tracks: timelineTracks },
      spatial: null,
      handPose: latestHandPose,
      ...(streams.some((stream) => stream.streamId === 'rbp-head-rgb' && stream.connectionState === 'live')
        ? { ...createCollectionVisuals(activeEpisode?.endedAtMs ?? observedAtMs, 'rbp-head-rgb'),
          bodyPose: streams.some((stream) => stream.streamId === 'external-fullbody-rgb' && stream.connectionState === 'live')
            ? createCollectionVisuals(activeEpisode?.endedAtMs ?? observedAtMs, 'rbp-head-rgb').bodyPose : null }
        : {}),
    };
  }

  #seedEpisode(id: string, captureSessionId: string, name: string, outcome: 'success' | 'failure', startedAtMs: number, durationMs: number): FlywheelEpisode {
    return {
      id, projectId: 'project-tiger', siteId: 'site-lab', captureSessionId, name, taskId: 'task-sort-fruit',
      instruction: 'Sort the fruit into the matching trays', robotId: 'robot-001', sensorDeviceId: 'sensor-rig-001', humanDemonstration: null, provenance: defaultProvenance,
      status: 'completed', outcome, startedAtMs, endedAtMs: startedAtMs + durationMs, bytesWritten: 1_620_000_000,
      annotationStatus: outcome === 'success' ? 'approved' : 'review', qualityStatus: outcome === 'success' ? 'passed' : 'failed',
      qualityWarnings: outcome === 'success' ? [] : ['Task outcome requires review'], finalizationError: null,
      events: [
        { id: `${id}-event-1`, occurredAtMs: startedAtMs + 8_000, type: 'grasp', label: 'Grasp object' },
        { id: `${id}-event-2`, occurredAtMs: startedAtMs + 29_000, type: outcome === 'success' ? 'release' : 'recovery', label: outcome === 'success' ? 'Place object' : 'Recovery attempt' },
      ], streams: copyStreams(),
    };
  }

  #passedPreflight() {
    return [
      { id: 'robot', label: '로봇 연결', state: 'passed' as const, detail: 'Operational' },
      { id: 'streams', label: '필수 스트림', state: 'passed' as const, detail: '5/5 streams available' },
      { id: 'clock', label: '시간 동기화', state: 'passed' as const, detail: 'Drift 18ms' },
      { id: 'storage', label: '저장 공간', state: 'passed' as const, detail: '2.8TB available' },
    ];
  }

  #humanDemonstrationPreflight(
    session: HumanoidCaptureSession,
  ) {
    if (session.humanDemonstration === null) {
      throw new Error('Human Demonstration preflight에는 source binding이 필요합니다.');
    }
    const requiredSources = session.humanDemonstration.sourceBindings.filter((source) => source.required);
    const connectedRequiredSources = requiredSources.filter((source) => (
      source.state === 'ready' || source.state === 'recording'
    ));
    return [
      {
        id: 'participant',
        label: 'Participant 가명',
        state: 'passed' as const,
        detail: `${session.humanDemonstration.participantId} · Session 범위`,
      },
      {
        id: 'sources',
        label: '필수 source',
        state: connectedRequiredSources.length === requiredSources.length ? 'passed' as const : 'failed' as const,
        detail: `${String(connectedRequiredSources.length)}/${String(requiredSources.length)} collectors connected`,
      },
      {
        id: 'clock-contract',
        label: '시간 계약',
        state: 'passed' as const,
        detail: 'device monotonic / Backend receive 분리',
      },
      {
        id: 'calibration',
        label: '좌표계 Calibration',
        state: 'warning' as const,
        detail: '품질 검토 필요 · raw 수집은 보존',
      },
    ];
  }

  #computeResources(): readonly ComputeResource[] {
    const busy = new Set(this.#trainingRuns.filter((item) => item.status === 'running').flatMap((item) => item.computeResourceIds));
    return Array.from({ length: 8 }, (_, index) => {
      const id = `gpu-${String(index)}`;
      const isBusy = busy.has(id) || index >= 4;
      return { id, displayName: `GPU ${String(index)}`, modelName: 'NVIDIA A100-SXM4-80GB', memoryTotalMb: 81_920,
        memoryUsedMb: isBusy ? 74_250 : index === 2 ? 52_300 : 1, utilizationPercent: isBusy ? 100 : index === 2 ? 68 : 0,
        status: isBusy ? 'busy' as const : index === 2 ? 'medium' as const : 'idle' as const };
    });
  }

  #validateDatasetReferences(kind: DataUnitKind, refs: readonly DatasetUnitRef[], projectId: string): void {
    if (refs.length === 0) throw new Error('데이터 단위를 하나 이상 선택해야 합니다.');
    const valid = refs.every((ref) =>
      (kind === 'humanoid-episode' && ref.kind === 'episode')
      || (kind === 'drive-window' && ref.kind === 'drive-window')
      || (kind === 'intervention-window' && ref.kind === 'intervention-window'));
    if (!valid) throw new Error('Dataset kind와 다른 데이터 단위를 혼합할 수 없습니다.');
    for (const ref of refs) {
      const source = ref.kind === 'episode'
        ? this.#episodes.find((item) => item.id === ref.episodeId)
        : ref.kind === 'drive-window'
          ? this.#drives.find((item) => item.id === ref.driveSessionId)
          : this.#interventions.find((item) => item.id === ref.interventionId);
      if (source === undefined) throw new Error('선택한 데이터 단위를 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
      if (source.projectId !== projectId) throw new Error('다른 프로젝트의 데이터를 포함할 수 없습니다.');
      if (ref.kind === 'episode') {
        const session = 'captureSessionId' in source
          ? this.#sessions.find((item) => item.id === source.captureSessionId)
          : undefined;
        if (!('endedAtMs' in source) || source.status !== 'completed' || source.endedAtMs === null
          || (session?.kind === 'humanoid' && session.activeEpisodeId === source.id)) {
          throw new Error('저장이 완료된 에피소드만 포함할 수 있습니다.');
        }
      } else if (ref.kind === 'drive-window') {
        if (!('durationMs' in source) || source.status !== 'completed') {
          throw new Error('저장이 완료된 주행만 포함할 수 있습니다.');
        }
        if (!Number.isFinite(ref.startMs) || !Number.isFinite(ref.endMs)
          || ref.startMs < 0 || ref.endMs <= ref.startMs || ref.endMs > source.durationMs) {
          throw new Error('주행 구간은 저장된 주행 시간 안에서 지정해야 합니다.');
        }
      } else {
        if (!('endMs' in source) || source.endMs === null) {
          throw new Error('종료된 개입 구간만 포함할 수 있습니다.');
        }
        const drive = this.#drives.find((item) => item.id === source.driveSessionId);
        if (drive?.status !== 'completed' || drive.projectId !== projectId) {
          throw new Error('개입 구간의 주행 저장이 완료되어야 합니다.');
        }
        if (!Number.isFinite(ref.preMs) || !Number.isFinite(ref.postMs) || ref.preMs < 0 || ref.postMs < 0) {
          throw new Error('개입 전후 구간은 0 이상의 시간으로 지정해야 합니다.');
        }
      }
    }
  }

  #advanceTraining(id: string, phase: 'running' | 'progress' | 'succeeded'): void {
    const current = this.#trainingRuns.find((item) => item.id === id);
    if (current === undefined || current.status === 'cancelled' || this.#disposed) return;
    if (phase === 'running') {
      this.#trainingRuns = this.#trainingRuns.map((item) => item.id === id ? { ...item, status: 'running', logs: [...item.logs, 'GPU resources allocated'] } : item);
    } else if (phase === 'progress') {
      this.#trainingRuns = this.#trainingRuns.map((item) => item.id === id ? {
        ...item, status: 'running', currentStep: Math.round(item.steps / 2), metrics: [{ step: Math.round(item.steps / 2), loss: 0.74, throughput: 95 }],
        checkpoints: [`checkpoint-${String(Math.round(item.steps / 2))}`], logs: [...item.logs, 'Midpoint checkpoint saved'],
      } : item);
    } else {
      const modelId = this.#nextId('model');
      const dataset = this.#datasets.find((item) => item.id === current.datasetVersionId);
      const model: ModelVersion = {
        id: modelId, projectId: current.projectId, name: current.name, version: 1, modelFamily: current.modelFamily,
        robotType: dataset?.kind === 'humanoid-episode' ? 'humanoid' : 'quadruped', stage: 'candidate', trainingRunId: current.id,
        datasetVersionId: current.datasetVersionId, evaluationRunIds: [], artifactSizeBytes: 8_000_000_000, createdAtMs: this.#clock.nowMs(),
      };
      this.#models = [model, ...this.#models];
      this.#trainingRuns = this.#trainingRuns.map((item) => item.id === id ? {
        ...item, status: 'succeeded', currentStep: item.steps, metrics: [...item.metrics, { step: item.steps, loss: 0.28, throughput: 97 }],
        checkpoints: [...item.checkpoints, `checkpoint-${String(item.steps)}`], logs: [...item.logs, 'Training completed'], modelVersionId: modelId,
      } : item);
    }
    this.#notify();
  }

  #advanceEvaluation(id: string, complete: boolean): void {
    const current = this.#evaluations.find((item) => item.id === id);
    if (current === undefined || current.status === 'cancelled' || this.#disposed) return;
    const score = 86.2;
    this.#evaluations = this.#evaluations.map((item) => item.id === id ? complete ? {
      ...item, status: score >= item.passThreshold ? 'passed' : 'failed', score,
      metrics: item.robotType === 'humanoid'
        ? [{ label: 'Task 성공률', value: score, unit: '%' }, { label: '복구 성공률', value: 71, unit: '%' }]
        : [{ label: '목적지 도달률', value: score, unit: '%' }, { label: 'Intervention/km', value: 0.8, unit: '건/km' }],
    } : { ...item, status: 'running' } : item);
    if (complete) {
      this.#models = this.#models.map((item) => item.id === current.modelVersionId
        ? { ...item, evaluationRunIds: [...new Set([...item.evaluationRunIds, id])] }
        : item);
    }
    this.#notify();
  }

  #activateDeployment(id: string): void {
    const deployment = this.#deployments.find((item) => item.id === id);
    if (deployment === undefined || deployment.status !== 'deploying' || this.#disposed) return;
    this.#deployments = this.#deployments.map((item) => item.id === id ? { ...item, status: 'active', latencyMs: 46, actionRateHz: item.controlFrequencyHz - 0.2 } : item);
    const inference: InferenceSession = {
      id: this.#nextId('inference'), projectId: deployment.projectId, deploymentId: deployment.id, modelVersionId: deployment.modelVersionId,
      robotId: deployment.robotIds[0] ?? 'unassigned', task: 'Canary verification task', status: 'completed', outcome: 'success',
      averageLatencyMs: 46, actionRateHz: deployment.controlFrequencyHz - 0.2, interventionId: null,
      startedAtMs: this.#clock.nowMs(), endedAtMs: this.#clock.nowMs() + 30_000,
      steps: [{ timestampMs: this.#clock.nowMs(), prompt: 'Verify deployment', action: 'hold_position', confidence: 0.96 }],
    };
    this.#inferences = [inference, ...this.#inferences];
    this.#notify();
  }

  #catalogCollections(): CatalogCollection[] {
    return this.#sessions
      .filter((item): item is HumanoidCaptureSession => item.kind === 'humanoid' && item.status === 'completed')
      .map((session) => {
        const episodes = session.episodeIds
          .map((id) => this.#episodes.find((item) => item.id === id))
          .filter((item): item is FlywheelEpisode => (
            item !== undefined
            && item.status === 'completed'
            && (item.outcome === null || item.outcome === 'success')
          ));
        const qualityStatus: CatalogCollection['qualityStatus'] = episodes.some((item) => item.qualityStatus === 'quarantined')
          ? 'quarantined'
          : episodes.some((item) => item.qualityStatus === 'failed')
            ? 'failed'
            : episodes.some((item) => item.qualityStatus === 'pending')
              ? 'pending'
              : 'passed';
        return {
          id: session.id,
          projectId: session.projectId,
          siteId: session.siteId,
          name: session.name,
          robotId: session.robotId,
          participantId: session.humanDemonstration?.participantId ?? null,
          taskId: session.taskId,
          instruction: session.instruction,
          completedAtMs: session.updatedAtMs,
          episodeIds: episodes.map((item) => item.id),
          qualityStatus,
        };
      })
      .sort((left, right) => right.completedAtMs - left.completedAtMs);
  }

  #finalizeEpisode(episodeId: string, outcome: FlywheelEpisode['outcome']): FlywheelEpisode {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    if (episode.status !== 'recording' && episode.status !== 'finalizing') return episode;
    const now = this.#clock.nowMs();
    const updated: FlywheelEpisode = {
      ...episode,
      status: 'completed',
      outcome,
      endedAtMs: episode.endedAtMs ?? now,
      bytesWritten: episode.bytesWritten > 0
        ? episode.bytesWritten
        : Math.max(200_000_000, now - episode.startedAtMs) * 12,
      qualityStatus: outcome === 'aborted' ? 'quarantined' : episode.qualityStatus,
      streams: episode.humanDemonstration === null
        ? copyStreams()
        : humanDemonstrationStreams(episode.humanDemonstration, 'stopped'),
      finalizationError: null,
    };
    this.#episodes = this.#episodes.map((item) => item.id === episodeId ? updated : item);
    const session = this.#sessions.find((item) => item.id === episode.captureSessionId);
    if (session?.kind === 'humanoid' && outcome !== null) {
      this.#replaceSession({ ...session, activeEpisodeId: null });
    } else {
      this.#notify();
    }
    return updated;
  }

  #scheduleSessionProcessing(sessionId: string): void {
    this.#schedule(250, () => {
      const session = this.#sessions.find((item) => item.id === sessionId);
      if (session?.kind !== 'humanoid' || session.status !== 'processing') return;
      this.#replaceSession({ ...session, processingStage: 'indexing' });
    });
    this.#schedule(500, () => {
      const session = this.#sessions.find((item) => item.id === sessionId);
      if (session?.kind !== 'humanoid' || session.status !== 'processing') return;
      this.#replaceSession({
        ...session,
        status: 'completed',
        processingStage: null,
        errorMessage: null,
      });
    });
  }

  readonly #handleSyncMessage = (serializedMessage: string): void => {
    if (this.#disposed || this.#syncTransport === null) return;
    try {
      const message = parseOperationalSyncMessage(serializedMessage);
      if (message === null || message.senderId === this.#syncTransport.clientId) return;
      if (message.type === 'state-request') {
        this.#publishOperationalSnapshot();
        return;
      }
      const isNewer = message.revision > this.#syncRevision
        || (message.revision === this.#syncRevision && message.senderId > this.#lastSyncSenderId);
      if (!isNewer) return;
      this.#syncRevision = message.revision;
      this.#lastSyncSenderId = message.senderId;
      this.#applyOperationalSnapshot(message.snapshot);
      this.#listeners.forEach((listener) => listener());
    } catch {
      // 호환되지 않거나 손상된 Mock transport 입력은 현재 상태를 덮어쓰지 않는다.
    }
  };

  #sendSyncMessage(message: OperationalSyncMessage): void {
    this.#syncTransport?.send(JSON.stringify(message));
  }

  #publishOperationalSnapshot(): void {
    const transport = this.#syncTransport;
    if (transport === null) return;
    this.#sendSyncMessage({
      schemaVersion: 1,
      type: 'state-snapshot',
      senderId: transport.clientId,
      revision: this.#syncRevision,
      snapshot: {
        sessions: this.#sessions,
        episodes: this.#episodes,
        handPoseMetrics: [...this.#handPoseMetrics.entries()],
        handPoseFrames: [...this.#handPoseFrames.entries()],
        handPosePreviews: [...this.#handPosePreviews.entries()],
      },
    });
  }

  #applyOperationalSnapshot(snapshot: OperationalSnapshot): void {
    this.#sessions = snapshot.sessions;
    this.#episodes = snapshot.episodes;
    this.#handPoseMetrics.clear();
    snapshot.handPoseMetrics.forEach(([sessionId, metrics]) => this.#handPoseMetrics.set(sessionId, metrics));
    this.#handPoseFrames.clear();
    snapshot.handPoseFrames.forEach(([episodeId, frames]) => this.#handPoseFrames.set(episodeId, frames));
    this.#handPosePreviews.clear();
    snapshot.handPosePreviews.forEach(([sessionId, preview]) => this.#handPosePreviews.set(sessionId, preview));
    this.#sequence = [...this.#sessions, ...this.#episodes].reduce((maximum, item) => {
      const suffix = Number.parseInt(item.id.match(/(\d+)$/u)?.[1] ?? '0', 10);
      return Math.max(maximum, suffix);
    }, this.#sequence);
  }

  #replaceSession(session: FlywheelCaptureSession): void {
    const updated = { ...session, updatedAtMs: this.#clock.nowMs() };
    this.#sessions = this.#sessions.map((item) => item.id === session.id ? updated : item);
    this.#notify();
  }

  #requireSession(id: string): FlywheelCaptureSession {
    this.#assertActive();
    const session = this.#sessions.find((item) => item.id === id);
    if (session === undefined) throw new Error('수집 세션을 찾을 수 없습니다.');
    return session;
  }

  #requireHumanDemonstrationSession(
    id: string,
  ): HumanoidCaptureSession & { readonly humanDemonstration: HumanDemonstrationBinding } {
    const session = this.#requireSession(id);
    if (session.kind !== 'humanoid' || session.humanDemonstration === null) {
      throw new Error('Human Demonstration Session을 찾을 수 없습니다.');
    }
    return session as HumanoidCaptureSession & { readonly humanDemonstration: HumanDemonstrationBinding };
  }

  #nextId(prefix: string): string {
    this.#sequence += 1;
    return `${prefix}-${String(this.#sequence).padStart(4, '0')}`;
  }

  #schedule(delayMs: number, action: () => void): void {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      if (!this.#disposed) action();
    }, delayMs);
    this.#timers.add(timer);
  }

  #notify(): void {
    if (this.#disposed) return;
    if (this.#syncTransport !== null) {
      this.#syncRevision += 1;
      this.#lastSyncSenderId = this.#syncTransport.clientId;
      this.#publishOperationalSnapshot();
    }
    this.#listeners.forEach((listener) => listener());
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Flywheel Adapter가 종료되었습니다.');
  }
}

export function createInMemoryFlywheel(
  clock: ClockPort,
  options: InMemoryFlywheelOptions = {},
): FlywheelPort {
  return new InMemoryFlywheel(clock, options);
}
