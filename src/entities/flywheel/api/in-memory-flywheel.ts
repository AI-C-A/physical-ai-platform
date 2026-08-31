/* eslint-disable @typescript-eslint/require-await -- In-memory commands intentionally preserve the asynchronous Port contract. */
import type { ClockPort } from '@/shared/lib/clock';

import type {
  AnnotationTask,
  CollectionTemplate,
  ComputeResource,
  CreateDatasetVersionInput,
  CreateDeploymentInput,
  CreateEvaluationRunInput,
  CreateHumanoidSessionInput,
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
  HumanoidCaptureSession,
  InferenceSession,
  InterventionEvent,
  LineageEdge,
  LineageNode,
  MobilityCaptureSession,
  ModelVersion,
  ProjectDescriptor,
  QualityRun,
  TrainingRun,
} from '../model/flywheel';

const defaultProvenance = {
  environment: 'physical',
  deliveryMode: 'live',
  controlMode: 'mixed',
  dataOrigin: 'captured',
} as const;

function copyStreams(state: FlywheelStream['status'] = 'stopped'): readonly FlywheelStream[] {
  return [
    { id: 'camera-head', displayName: 'Head RGB', expectedRateHz: 30, observedRateHz: 29.8, bytesWritten: 836_000_000, status: state },
    { id: 'camera-left', displayName: 'Left Hand RGB', expectedRateHz: 30, observedRateHz: 29.7, bytesWritten: 428_000_000, status: state },
    { id: 'camera-right', displayName: 'Right Hand RGB', expectedRateHz: 30, observedRateHz: 29.9, bytesWritten: 431_000_000, status: state },
    { id: 'robot-state', displayName: 'Robot State', expectedRateHz: 100, observedRateHz: 99.6, bytesWritten: 26_000_000, status: state },
    { id: 'action', displayName: 'Action', expectedRateHz: 50, observedRateHz: 49.8, bytesWritten: 14_000_000, status: state },
  ];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryFlywheel implements FlywheelPort {
  readonly #clock: ClockPort;
  readonly #listeners = new Set<() => void>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
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

  constructor(clock: ClockPort) {
    this.#clock = clock;
    const now = clock.nowMs();
    this.#projects = [
      { id: 'project-tiger', displayName: 'TIGER Physical AI', description: '휴머노이드·모바일 로봇 공통 플라이휠' },
      { id: 'project-logistics', displayName: 'Logistics Generalist', description: '물류 조작과 자율주행 데이터' },
    ];
    this.#sessions = [
      {
        id: 'capture-h-001', projectId: 'project-tiger', siteId: 'site-lab', name: 'Desktop sorting batch', kind: 'humanoid',
        robotId: 'robot-001', robotType: 'humanoid', sensorDeviceId: 'sensor-rig-001', provenance: defaultProvenance,
        status: 'completed', createdAtMs: now - 86_400_000, startedAtMs: now - 85_800_000, stoppedAtMs: now - 82_200_000,
        bytesWritten: 3_420_000_000, streams: copyStreams(), preflight: this.#passedPreflight(), taskId: 'task-sort-fruit',
        instruction: 'Sort the fruit into the matching trays', episodeIds: ['episode-fw-001', 'episode-fw-002'], activeEpisodeId: null,
      },
      {
        id: 'capture-m-001', projectId: 'project-tiger', siteId: 'site-pangyo', name: 'Pangyo patrol route A', kind: 'mobility',
        robotId: 'robot-002', robotType: 'quadruped', sensorDeviceId: 'sensor-rig-002', provenance: { ...defaultProvenance, controlMode: 'autonomous' },
        status: 'completed', createdAtMs: now - 43_200_000, startedAtMs: now - 42_900_000, stoppedAtMs: now - 39_300_000,
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
  }

  listProjects = () => Promise.resolve(clone(this.#projects));
  listTemplates = (): Promise<readonly CollectionTemplate[]> => Promise.resolve([
    { id: 'template-h', projectId: 'project-tiger', name: 'Humanoid VLA default', kind: 'humanoid', robotType: 'humanoid', streamIds: copyStreams().map((item) => item.id), syncToleranceMs: 50, preBufferMs: 0, postBufferMs: 0 },
    { id: 'template-m', projectId: 'project-tiger', name: 'Mobility intervention default', kind: 'mobility', robotType: 'quadruped', streamIds: copyStreams().map((item) => item.id), syncToleranceMs: 80, preBufferMs: 10_000, postBufferMs: 20_000 },
  ]);
  listSessions = () => Promise.resolve(clone(this.#sessions));
  getSession = (id: string) => Promise.resolve(clone(this.#sessions.find((item) => item.id === id) ?? null));
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
      status: 'draft', createdAtMs: this.#clock.nowMs(), startedAtMs: null, stoppedAtMs: null, bytesWritten: 0,
      streams: copyStreams('waiting'), preflight: [], episodeIds: [], activeEpisodeId: null,
    };
    this.#sessions = [session, ...this.#sessions];
    this.#notify();
    return clone(session);
  }

  async createMobilitySession(input: CreateMobilitySessionInput): Promise<MobilityCaptureSession> {
    this.#assertActive();
    const session: MobilityCaptureSession = {
      id: this.#nextId('capture-m'), projectId: input.projectId, siteId: input.siteId, name: input.name,
      kind: 'mobility', robotId: input.robotId, robotType: 'quadruped', sensorDeviceId: input.sensorDeviceId,
      provenance: { ...defaultProvenance, controlMode: 'autonomous' }, status: 'draft', createdAtMs: this.#clock.nowMs(),
      startedAtMs: null, stoppedAtMs: null, bytesWritten: 0, streams: copyStreams('waiting'), preflight: [], routeId: input.routeId,
      driveSessionId: null, interventionIds: [], chunkPolicy: { durationMs: 300_000, preBufferMs: input.preBufferMs, postBufferMs: input.postBufferMs },
      controlMode: 'autonomous',
    };
    this.#sessions = [session, ...this.#sessions];
    this.#notify();
    return clone(session);
  }

  async validateSession(id: string): Promise<FlywheelCaptureSession> {
    const session = this.#requireSession(id);
    const updated = { ...session, status: 'ready' as const, preflight: this.#passedPreflight() };
    this.#replaceSession(updated);
    return clone(updated);
  }

  async startSession(id: string): Promise<FlywheelCaptureSession> {
    const session = this.#requireSession(id);
    if (session.status !== 'ready') throw new Error('사전점검을 통과한 세션만 시작할 수 있습니다.');
    const now = this.#clock.nowMs();
    if (session.kind === 'humanoid') {
      const updated: HumanoidCaptureSession = { ...session, status: 'recording', startedAtMs: now, streams: copyStreams('active') };
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
    if (session.status !== 'recording') throw new Error('기록 중인 세션만 종료할 수 있습니다.');
    const now = this.#clock.nowMs();
    if (session.kind === 'humanoid') {
      if (session.activeEpisodeId !== null) await this.completeEpisode(session.activeEpisodeId, 'aborted');
      const latest = this.#requireSession(id) as HumanoidCaptureSession;
      const updated: HumanoidCaptureSession = { ...latest, status: 'completed', stoppedAtMs: now, streams: copyStreams(), bytesWritten: latest.episodeIds.length * 1_700_000_000 };
      this.#replaceSession(updated);
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

  async startEpisode(sessionId: string, name: string): Promise<FlywheelEpisode> {
    const session = this.#requireSession(sessionId);
    if (session.kind !== 'humanoid' || session.status !== 'recording') throw new Error('기록 중인 휴머노이드 세션이 필요합니다.');
    if (session.activeEpisodeId !== null) throw new Error('동시에 둘 이상의 Episode를 기록할 수 없습니다.');
    const episode: FlywheelEpisode = {
      id: this.#nextId('episode-fw'), projectId: session.projectId, siteId: session.siteId, captureSessionId: session.id,
      name: name.trim() || `${session.name} Episode`, taskId: session.taskId, instruction: session.instruction, robotId: session.robotId,
      sensorDeviceId: session.sensorDeviceId, provenance: session.provenance, status: 'recording', outcome: null,
      startedAtMs: this.#clock.nowMs(), endedAtMs: null, bytesWritten: 0, annotationStatus: 'unassigned', qualityStatus: 'pending',
      events: [], streams: copyStreams('active'),
    };
    this.#episodes = [episode, ...this.#episodes];
    this.#replaceSession({ ...session, activeEpisodeId: episode.id, episodeIds: [...session.episodeIds, episode.id] });
    return clone(episode);
  }

  async completeEpisode(episodeId: string, outcome: 'success' | 'failure' | 'aborted'): Promise<FlywheelEpisode> {
    const episode = this.#episodes.find((item) => item.id === episodeId);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    if (episode.status !== 'recording') throw new Error('기록 중인 Episode만 종료할 수 있습니다.');
    const now = this.#clock.nowMs();
    const updated: FlywheelEpisode = {
      ...episode, status: 'completed', outcome, endedAtMs: now, bytesWritten: Math.max(200_000_000, now - episode.startedAtMs) * 12,
      annotationStatus: 'unassigned', qualityStatus: outcome === 'aborted' ? 'quarantined' : 'passed', streams: copyStreams(),
    };
    this.#episodes = this.#episodes.map((item) => item.id === episodeId ? updated : item);
    const session = this.#requireSession(episode.captureSessionId);
    if (session.kind === 'humanoid') this.#replaceSession({ ...session, activeEpisodeId: null });
    this.#notify();
    return clone(updated);
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
    this.#validateUnitKinds(input.kind, input.unitRefs);
    if (input.unitRefs.length === 0) throw new Error('데이터 단위를 하나 이상 선택해야 합니다.');
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
    if (current.unitRefs.length === 0) throw new Error('비어 있는 Dataset은 Release할 수 없습니다.');
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
    const completedEpisodes = this.#episodes.filter((item) => item.status === 'completed');
    const successfulEpisodes = completedEpisodes.filter((item) => item.outcome === 'success');
    const totalDistance = this.#drives.reduce((sum, item) => sum + item.distanceMeters, 0);
    const passedQuality = [...this.#episodes, ...this.#drives, ...this.#interventions].filter((item) => item.qualityStatus === 'passed').length;
    const totalQuality = this.#episodes.length + this.#drives.length + this.#interventions.length;
    return Promise.resolve({
      episodeCount: this.#episodes.length,
      driveHours: this.#drives.reduce((sum, item) => sum + item.durationMs, 0) / 3_600_000,
      validDataPercent: totalQuality === 0 ? 0 : passedQuality / totalQuality * 100,
      taskSuccessPercent: completedEpisodes.length === 0 ? 0 : successfulEpisodes.length / completedEpisodes.length * 100,
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

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#timers.forEach((timer) => clearTimeout(timer));
    this.#timers.clear();
    this.#listeners.clear();
  }

  #seedEpisode(id: string, captureSessionId: string, name: string, outcome: 'success' | 'failure', startedAtMs: number, durationMs: number): FlywheelEpisode {
    return {
      id, projectId: 'project-tiger', siteId: 'site-lab', captureSessionId, name, taskId: 'task-sort-fruit',
      instruction: 'Sort the fruit into the matching trays', robotId: 'robot-001', sensorDeviceId: 'sensor-rig-001', provenance: defaultProvenance,
      status: 'completed', outcome, startedAtMs, endedAtMs: startedAtMs + durationMs, bytesWritten: 1_620_000_000,
      annotationStatus: outcome === 'success' ? 'approved' : 'review', qualityStatus: outcome === 'success' ? 'passed' : 'failed',
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

  #validateUnitKinds(kind: DataUnitKind, refs: readonly DatasetUnitRef[]): void {
    const valid = refs.every((ref) =>
      (kind === 'humanoid-episode' && ref.kind === 'episode')
      || (kind === 'drive-window' && ref.kind === 'drive-window')
      || (kind === 'intervention-window' && ref.kind === 'intervention-window'));
    if (!valid) throw new Error('Dataset kind와 다른 데이터 단위를 혼합할 수 없습니다.');
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

  #replaceSession(session: FlywheelCaptureSession): void {
    this.#sessions = this.#sessions.map((item) => item.id === session.id ? session : item);
    this.#notify();
  }

  #requireSession(id: string): FlywheelCaptureSession {
    this.#assertActive();
    const session = this.#sessions.find((item) => item.id === id);
    if (session === undefined) throw new Error('수집 세션을 찾을 수 없습니다.');
    return session;
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
    this.#listeners.forEach((listener) => listener());
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Flywheel Adapter가 종료되었습니다.');
  }
}

export function createInMemoryFlywheel(clock: ClockPort): FlywheelPort {
  return new InMemoryFlywheel(clock);
}
