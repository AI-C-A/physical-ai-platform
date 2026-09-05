const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function formatDateTime(timestampMs: number | null): string {
  return timestampMs === null ? '—' : dateTimeFormatter.format(timestampMs);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

export function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}분 ${String(seconds % 60)}초`;
}

export function formatRateHertz(rateHz: number | null): string {
  return rateHz === null ? '—' : `${rateHz.toFixed(1)} Hz`;
}

export function formatRelativeTime(timestampMs: number | null, nowMs = Date.now()): string {
  if (timestampMs === null) return '수신 기록 없음';
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1_000));
  if (elapsedSeconds < 5) return '방금 전';
  if (elapsedSeconds < 60) return `${String(elapsedSeconds)}초 전`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${String(elapsedMinutes)}분 전`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${String(elapsedHours)}시간 전`;
  return dateTimeFormatter.format(timestampMs);
}

export function getDisplayTimeZoneLabel(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || '브라우저 기본 시간대';
}
