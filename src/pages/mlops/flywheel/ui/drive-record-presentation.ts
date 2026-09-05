import type { DriveSession, InterventionEvent } from '@/entities/flywheel';
import type { TimelineMarker } from '@/shared/ui/timeline';

export function getDriveTimelineMarkers(drive: DriveSession, interventions: readonly InterventionEvent[]): readonly TimelineMarker[] {
  const end = drive.endedAtMs ?? drive.startedAtMs + Math.max(0, drive.durationMs);
  const duration = end - drive.startedAtMs;
  const events: TimelineMarker[] = [{ id: 'drive-start', label: '주행 시작', offsetPercent: 0, tone: 'info' }];
  for (const intervention of [...interventions].sort((left, right) => left.startMs - right.startMs)) {
    if (intervention.driveSessionId !== drive.id || intervention.startMs < drive.startedAtMs || intervention.startMs > end) continue;
    events.push({ id: intervention.id, label: `개입 기록 · ${intervention.id}`, offsetPercent: duration <= 0 ? 0 : (intervention.startMs - drive.startedAtMs) / duration * 100, tone: 'negative' });
  }
  if (drive.endedAtMs !== null) events.push({ id: 'drive-end', label: '주행 종료', offsetPercent: 100, tone: 'info' });
  return events;
}

export function getInterventionTimelineMarkers(item: InterventionEvent): readonly TimelineMarker[] {
  const end = item.endMs ?? item.controlReturnedAtMs ?? item.startMs;
  const duration = end - item.startMs;
  const markers: TimelineMarker[] = [{ id: 'record-start', label: '기록 시작', offsetPercent: 0, tone: 'info' }];
  if (item.controlReturnedAtMs !== null && item.controlReturnedAtMs >= item.startMs && item.controlReturnedAtMs <= end) {
    markers.push({ id: 'control-returned', label: '제어 복귀', offsetPercent: duration <= 0 ? 0 : (item.controlReturnedAtMs - item.startMs) / duration * 100, tone: 'positive' });
  }
  if (item.endMs !== null) markers.push({ id: 'record-end', label: '기록 종료', offsetPercent: 100, tone: 'info' });
  return markers;
}
