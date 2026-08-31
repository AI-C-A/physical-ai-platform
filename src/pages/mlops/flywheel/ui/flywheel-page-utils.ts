export const VIDEO_SOURCE = '/assets/low-altitude-first-person-pov.mp4';

export function formatDateTime(value: number | null): string {
  if (value === null) return '—';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(value);
}

export function formatDuration(value: number): string {
  const seconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}분 ${String(seconds % 60)}초`;
}
