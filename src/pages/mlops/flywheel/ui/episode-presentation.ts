import type { FlywheelEpisode } from '@/entities/flywheel';
import type { TimelineMarker } from '@/shared/ui/timeline';

const eventLabels = { contact: '접촉', grasp: '파지', release: '놓기', collision: '충돌', recovery: '복구', subtask: '세부 작업' } as const;

export function getEpisodeStorageLabel(episode: FlywheelEpisode): string {
  if (episode.status === 'invalid') return '제외됨';
  if (episode.status === 'completed') return '저장됨';
  if (episode.status === 'recording') return '녹화 중';
  if (episode.status === 'finalizing') return episode.finalizationError === null ? '파일 정리 중' : '저장 확인 필요';
  return '검토 대기';
}

export function getEpisodeTimelineMarkers(episode: FlywheelEpisode): readonly TimelineMarker[] {
  const end = episode.endedAtMs ?? Math.max(episode.startedAtMs, ...episode.events.map((event) => event.occurredAtMs));
  const duration = end - episode.startedAtMs;
  return [...episode.events].sort((left, right) => left.occurredAtMs - right.occurredAtMs).map((event) => ({
    id: event.id,
    label: `${eventLabels[event.type]} · ${event.label}`,
    offsetPercent: duration <= 0 ? 0 : Math.max(0, Math.min(100, (event.occurredAtMs - episode.startedAtMs) / duration * 100)),
    tone: event.type === 'collision' ? 'negative' : event.type === 'recovery' ? 'info' : 'positive',
  }));
}
