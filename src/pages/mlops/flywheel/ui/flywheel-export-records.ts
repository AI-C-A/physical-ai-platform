import type {
  CatalogCollection,
  FlywheelEpisode,
  HumanDemonstrationBinding,
  HumanoidCaptureSession,
} from '@/entities/flywheel';

function exportSourceBindings(binding: HumanDemonstrationBinding | null) {
  if (binding === null) return null;
  return {
    participantId: binding.participantId,
    participantIdScope: binding.participantIdScope,
    exoskeletonDeviceId: binding.exoskeletonDeviceId,
    sources: binding.sourceBindings.map((source) => ({
      deviceId: source.sourceDeviceId,
      role: source.role,
      required: source.required,
    })),
  };
}

function exportStreams(streams: FlywheelEpisode['streams']) {
  return streams.map((stream) => ({
    id: stream.id,
    displayName: stream.displayName,
    status: stream.status,
    expectedRateHz: stream.expectedRateHz,
    observedRateHz: stream.observedRateHz,
    bytesWritten: stream.bytesWritten,
    origin: stream.origin,
    sourceDeviceId: stream.sourceDeviceId,
    coordinateFrame: stream.coordinateFrame,
    processingStatus: stream.processingStatus,
  }));
}

// 업무 DTO에 필드가 추가되어도 연결 코드와 연동 설정이 다운로드에 섞이지 않게 허용 필드만 옮긴다.
export function createCollectionSessionExportRecord(session: HumanoidCaptureSession) {
  return {
    id: session.id,
    name: session.name,
    kind: session.kind,
    projectId: session.projectId,
    siteId: session.siteId,
    taskId: session.taskId,
    instruction: session.instruction,
    robotId: session.robotId,
    robotType: session.robotType,
    sensorDeviceId: session.sensorDeviceId,
    environment: session.provenance.environment,
    status: session.status,
    createdAtMs: session.createdAtMs,
    updatedAtMs: session.updatedAtMs,
    startedAtMs: session.startedAtMs,
    stoppedAtMs: session.stoppedAtMs,
    bytesWritten: session.bytesWritten,
    episodeIds: [...session.episodeIds],
    humanDemonstration: exportSourceBindings(session.humanDemonstration),
    streams: exportStreams(session.streams),
    preflight: session.preflight.map((check) => ({ id: check.id, label: check.label, state: check.state })),
  };
}

export function createEpisodeExportRecord(episode: FlywheelEpisode) {
  return {
    id: episode.id,
    name: episode.name,
    projectId: episode.projectId,
    siteId: episode.siteId,
    captureSessionId: episode.captureSessionId,
    taskId: episode.taskId,
    instruction: episode.instruction,
    robotId: episode.robotId,
    sensorDeviceId: episode.sensorDeviceId,
    environment: episode.provenance.environment,
    status: episode.status,
    outcome: episode.outcome,
    startedAtMs: episode.startedAtMs,
    endedAtMs: episode.endedAtMs,
    bytesWritten: episode.bytesWritten,
    annotationStatus: episode.annotationStatus,
    qualityStatus: episode.qualityStatus,
    humanDemonstration: exportSourceBindings(episode.humanDemonstration),
    streams: exportStreams(episode.streams),
    events: episode.events.map((event) => ({
      id: event.id,
      occurredAtMs: event.occurredAtMs,
      type: event.type,
      label: event.label,
    })),
  };
}

export function createCatalogExportRecord(collection: CatalogCollection) {
  return {
    id: collection.id,
    name: collection.name,
    projectId: collection.projectId,
    siteId: collection.siteId,
    robotId: collection.robotId,
    participantId: collection.participantId,
    taskId: collection.taskId,
    instruction: collection.instruction,
    completedAtMs: collection.completedAtMs,
    episodeIds: [...collection.episodeIds],
    qualityStatus: collection.qualityStatus,
  };
}
