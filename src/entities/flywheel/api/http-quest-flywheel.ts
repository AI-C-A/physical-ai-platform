import type {
  CatalogCollection, CollectionHandPoseFrame, CollectionHandPoseTelemetry, CollectionStreamTelemetry,
  CollectionTelemetrySnapshot, FlywheelEpisode, FlywheelPort, HumanDemonstrationBinding,
  HumanDemonstrationProfile, HumanDemonstrationSourceState, HumanoidCaptureSession,
} from '../model/flywheel';
import { createUnavailableFlywheel } from './unavailable-flywheel';

interface StoredEpisode {
  readonly id: string;
  readonly name: string;
  readonly status: FlywheelEpisode['status'];
  readonly outcome: FlywheelEpisode['outcome'];
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
  readonly bytesWritten: number;
  readonly frameCount: number;
  readonly observedFrameCount: number;
  readonly acknowledgements: readonly {
    readonly command: 'start' | 'stop'; readonly state: 'acknowledged' | 'rejected';
    readonly acknowledgedAtMs: number; readonly detail: string | null;
  }[];
  readonly finalizationError: string | null;
}

interface CollectionRecord {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
  readonly siteId: string;
  readonly taskId: string;
  readonly instruction: string;
  readonly questDeviceId: string;
  readonly status: HumanoidCaptureSession['status'];
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly startedAtMs: number | null;
  readonly stoppedAtMs: number | null;
  readonly activeEpisodeId: string | null;
  readonly episodes: readonly StoredEpisode[];
  readonly pairing: HumanDemonstrationBinding['pairing'];
  readonly sourceState: HumanDemonstrationSourceState;
  readonly lastSeenAtMs: number | null;
  readonly observedAtMs: number;
  readonly frame: CollectionHandPoseTelemetry | null;
}

const profile: HumanDemonstrationProfile = {
  id: 'quest-hand-collection-v1', schemaVersion: 1,
  handTracking: { requiredHands: 'both', targetRateHz: 10, queueCapacityFrames: 600,
    maximumBatchFrames: 8, flushIntervalMs: 100, partialAfterMs: 250, lostAfterMs: 1_500 },
  streams: (['left', 'right'] as const).map((side) => ({
    streamId: `quest-hand-${side}`, displayName: side === 'left' ? '왼손 추적' : '오른손 추적',
    modality: 'hand-pose', origin: 'sensor', sourceRole: 'xr-hand-tracking', required: true,
    targetRateHz: 10, coordinateFrame: 'quest-local-floor', maximumDriftMs: null, minimumCompletenessPercent: null,
  })),
};

function binding(record: CollectionRecord): HumanDemonstrationBinding {
  return {
    participantId: `participant-${record.id}`, participantIdScope: 'session', exoskeletonDeviceId: '', profile,
    sourceBindings: [{ sourceDeviceId: record.questDeviceId, role: 'xr-hand-tracking',
      integrationProfileId: profile.id, required: true, state: record.sourceState,
      capabilities: ['left-hand-pose', 'right-hand-pose'], lastSeenAtMs: record.lastSeenAtMs,
      activeEpisodeId: record.activeEpisodeId }],
    collectorAcknowledgements: record.episodes.flatMap((episode) => episode.acknowledgements.map((ack) => ({
      ...ack, sessionId: record.id, episodeId: episode.id, sourceDeviceId: record.questDeviceId,
    }))),
    pairing: record.pairing,
  };
}

function isReady(record: CollectionRecord): boolean {
  return ['ready', 'recording'].includes(record.sourceState)
    && record.frame?.hands.left.poseObserved === true && record.frame.hands.right.poseObserved;
}

function sessionFrom(record: CollectionRecord): HumanoidCaptureSession {
  const ready = isReady(record);
  return {
    id: record.id, name: record.name, projectId: record.projectId, siteId: record.siteId,
    kind: 'humanoid', robotId: null, robotType: null, sensorDeviceId: record.questDeviceId,
    provenance: { environment: 'physical', deliveryMode: 'live', controlMode: 'manual', dataOrigin: 'captured' },
    status: record.status, createdAtMs: record.createdAtMs, updatedAtMs: record.updatedAtMs,
    startedAtMs: record.startedAtMs, stoppedAtMs: record.stoppedAtMs,
    bytesWritten: record.episodes.reduce((sum, episode) => sum + episode.bytesWritten, 0),
    streams: profile.streams.map((stream) => ({ id: stream.streamId, displayName: stream.displayName,
      expectedRateHz: stream.targetRateHz, observedRateHz: null,
      bytesWritten: record.episodes.reduce((sum, episode) => sum + episode.bytesWritten, 0) / 2,
      status: record.stoppedAtMs !== null ? 'stopped' : ready ? 'active' : 'waiting',
      origin: 'sensor', sourceDeviceId: record.questDeviceId, coordinateFrame: 'quest-local-floor' })),
    preflight: [{ id: 'quest-hands', label: 'Quest 양손 추적', state: ready ? 'passed' : 'failed',
      detail: ready ? '양손의 관절 데이터를 수신하고 있습니다.' : 'Quest를 연결하고 MR 모드에서 양손 추적을 시작하세요.' }],
    taskId: record.taskId, instruction: record.instruction, sensorPresetId: profile.id,
    episodeIds: record.episodes.map((episode) => episode.id), activeEpisodeId: record.activeEpisodeId,
    processingStage: null, errorMessage: null, humanDemonstration: binding(record),
  };
}

function episodeFrom(record: CollectionRecord, stored: StoredEpisode): FlywheelEpisode {
  const session = sessionFrom(record);
  return {
    id: stored.id, name: stored.name, projectId: record.projectId, siteId: record.siteId,
    captureSessionId: record.id, taskId: record.taskId, instruction: record.instruction,
    robotId: null, sensorDeviceId: record.questDeviceId, humanDemonstration: session.humanDemonstration,
    provenance: { ...session.provenance, deliveryMode: stored.status === 'recording' ? 'live' : 'replay' },
    status: stored.status, outcome: stored.outcome, startedAtMs: stored.startedAtMs, endedAtMs: stored.endedAtMs,
    bytesWritten: stored.bytesWritten, annotationStatus: 'unassigned', qualityStatus: 'pending',
    qualityWarnings: stored.observedFrameCount < stored.frameCount ? ['양손 추적이 누락된 프레임이 있습니다.'] : [],
    finalizationError: stored.finalizationError, events: [],
    streams: session.streams.map((stream) => ({ ...stream, bytesWritten: stored.bytesWritten / 2,
      status: stored.status === 'recording' ? 'active' : 'stopped' })),
  };
}

function telemetryFrom(record: CollectionRecord): CollectionTelemetrySnapshot {
  const active = record.episodes.find((episode) => episode.id === record.activeEpisodeId);
  const live = ['ready', 'recording'].includes(record.sourceState) && record.frame !== null;
  const connectionState = live ? 'live' : record.sourceState === 'stale' ? 'stale' : 'offline';
  const sampleCount = active?.frameCount ?? 0;
  const bytesWritten = active?.bytesWritten ?? 0;
  const streams: CollectionStreamTelemetry[] = profile.streams.map((stream, index) => {
    const hand = record.frame?.hands[index === 0 ? 'left' : 'right'];
    return {
      streamId: stream.streamId, displayName: stream.displayName, modality: 'hand-pose', required: true,
      health: live && hand?.poseObserved ? 'healthy' : 'disconnected', connectionState,
      expectedRateHz: 10, observedRateHz: null, latencyMs: null, driftMs: null,
      sampleCount, droppedFrameCount: 0, missingSampleCount: 0, bytesWritten: bytesWritten / 2,
      lastSampleAtMs: record.frame?.receivedTimestampMs ?? null, origin: 'sensor',
      sourceDeviceId: record.questDeviceId, coordinateFrame: 'quest-local-floor',
      handTracking: { qualityState: hand?.poseObserved ? 'tracking' : 'lost', poseObserved: hand?.poseObserved ?? false,
        sourcePresent: hand?.sourcePresent ?? false, consecutiveMissingMs: record.lastSeenAtMs === null ? 0 : Math.max(0, record.observedAtMs - record.lastSeenAtMs),
        validJointCount: hand?.poseObserved ? 25 : 0 },
    };
  });
  return {
    sessionId: record.id, activeEpisodeId: record.activeEpisodeId, observedAtMs: record.observedAtMs,
    freshness: { staleAfterMs: 1_500, offlineAfterMs: 5_000 }, connectionState,
    elapsedMs: active === undefined ? 0 : (active.endedAtMs ?? record.observedAtMs) - active.startedAtMs,
    totalSampleCount: sampleCount * 2, bytesWritten,
    completenessPercent: sampleCount === 0 ? 0 : (active?.observedFrameCount ?? 0) / sampleCount * 100,
    qualityVerdict: 'review', qualityIssues: [],
    sync: { state: 'unavailable', toleranceMs: 0, maxDriftMs: null },
    streams, timeline: { windowMs: 10_000, tracks: [] }, spatial: null, handPose: record.frame,
  };
}

function catalogFrom(record: CollectionRecord): CatalogCollection {
  return { id: record.id, projectId: record.projectId, siteId: record.siteId, name: record.name,
    robotId: null, participantId: `participant-${record.id}`, taskId: record.taskId, instruction: record.instruction,
    completedAtMs: record.stoppedAtMs ?? record.updatedAtMs,
    episodeIds: record.episodes.filter((episode) => episode.outcome === 'success').map((episode) => episode.id), qualityStatus: 'pending' };
}

export function createHttpQuestFlywheel(): FlywheelPort {
  const listeners = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setInterval>>();
  let cache: { readonly at: number; readonly promise: Promise<readonly CollectionRecord[]> } | null = null;
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/quest/collections${path}`, {
      method, cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error('수집 서버 요청을 완료하지 못했습니다. 연결과 장치 상태를 확인하세요.');
    return response.json() as Promise<T>;
  }
  const readAll = (): Promise<readonly CollectionRecord[]> => {
    if (cache === null || Date.now() - cache.at > 150) cache = { at: Date.now(), promise: request('') };
    return cache.promise;
  };
  const refresh = (): void => { cache = null; listeners.forEach((listener) => listener()); };
  const recordForEpisode = async (id: string): Promise<CollectionRecord> => {
    const record = (await readAll()).find((item) => item.episodes.some((episode) => episode.id === id));
    if (record === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    return record;
  };
  const command = async (id: string, action: string, episodeId?: string): Promise<CollectionRecord> => {
    const record = await request<CollectionRecord>(`/${encodeURIComponent(id)}/command`, 'POST', { command: action, episodeId });
    refresh(); return record;
  };
  const episodeCommand = async (id: string, action: string): Promise<FlywheelEpisode> => {
    const parent = await recordForEpisode(id);
    const record = await command(parent.id, action, id);
    const episode = record.episodes.find((item) => item.id === id);
    if (episode === undefined) throw new Error('Episode를 찾을 수 없습니다.');
    return episodeFrom(record, episode);
  };
  const subscribeAt = (listener: () => void, interval: number): (() => void) => {
    const timer = setInterval(listener, interval);
    timers.add(timer);
    return () => { clearInterval(timer); timers.delete(timer); };
  };
  return {
    ...createUnavailableFlywheel(),
    collectionMode: 'quest-hands',
    listSessions: async () => (await readAll()).map(sessionFrom),
    listOperationalSessions: async () => (await readAll()).filter((item) => !['completed', 'abandoned'].includes(item.status)).map(sessionFrom),
    getSession: async (id) => { const record = (await readAll()).find((item) => item.id === id); return record === undefined ? null : sessionFrom(record); },
    createHumanDemonstrationSession: async (input) => {
      const record = await request<CollectionRecord>('', 'POST', input); refresh(); return sessionFrom(record);
    },
    renewHumanDemonstrationPairing: async (id) => sessionFrom(await command(id, 'renew')),
    validateSession: async (id) => sessionFrom(await command(id, 'validate')),
    startSession: async (id) => sessionFrom(await command(id, 'start')),
    stopSession: async (id) => sessionFrom(await command(id, 'finish')),
    abandonSession: async (id) => sessionFrom(await command(id, 'abandon')),
    startEpisode: async (id) => {
      const record = await command(id, 'start-episode');
      const episode = record.episodes.find((item) => item.id === record.activeEpisodeId);
      if (episode === undefined) throw new Error('Episode를 시작하지 못했습니다.');
      return episodeFrom(record, episode);
    },
    stopEpisode: (id) => episodeCommand(id, 'stop-episode'),
    saveEpisode: (id) => episodeCommand(id, 'save-episode'),
    retryEpisodeFinalization: (id) => episodeCommand(id, 'retry-finalization'),
    invalidateEpisode: (id) => episodeCommand(id, 'invalidate-episode'),
    deleteEpisode: async (id) => { const parent = await recordForEpisode(id); await command(parent.id, 'delete-episode', id); },
    deleteOperationalSession: async (id) => { await request(`/${encodeURIComponent(id)}`, 'DELETE'); refresh(); },
    deleteCatalogCollection: async (id) => { await request(`/${encodeURIComponent(id)}`, 'DELETE'); refresh(); },
    getCollectionTelemetry: async (id) => telemetryFrom(await request<CollectionRecord>(`/${encodeURIComponent(id)}`)),
    getEpisodeHandPoseAt: async (id, offsetMs) => {
      const parent = await recordForEpisode(id);
      return request<CollectionHandPoseFrame | null>(`/${parent.id}/pose?episodeId=${encodeURIComponent(id)}&offsetMs=${String(offsetMs)}`);
    },
    listEpisodes: async () => (await readAll()).flatMap((record) => record.episodes.map((episode) => episodeFrom(record, episode))),
    getEpisode: async (id) => {
      const record = (await readAll()).find((item) => item.episodes.some((episode) => episode.id === id));
      const episode = record?.episodes.find((item) => item.id === id);
      return record === undefined || episode === undefined ? null : episodeFrom(record, episode);
    },
    listCatalogCollections: async () => (await readAll()).filter((record) => record.status === 'completed').map(catalogFrom),
    getCatalogCollection: async (id) => { const record = (await readAll()).find((item) => item.id === id && item.status === 'completed'); return record === undefined ? null : catalogFrom(record); },
    subscribe: (listener) => { listeners.add(listener); const unsubscribe = subscribeAt(listener, 500); return () => { listeners.delete(listener); unsubscribe(); }; },
    subscribeCollectionTelemetry: (_id, listener) => subscribeAt(listener, 100),
    dispose: () => { timers.forEach(clearInterval); timers.clear(); listeners.clear(); cache = null; },
  };
}
