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

export function getDisplayTimeZoneLabel(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || '브라우저 기본 시간대';
}
