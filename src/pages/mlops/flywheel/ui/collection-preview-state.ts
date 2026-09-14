import type { CollectionTelemetrySnapshot, HumanoidCaptureSession } from '@/entities/flywheel';
import type { MediaStreamState } from '@/shared/ui/media-panel';

export function hasHandPreview(states: Readonly<Record<string, MediaStreamState>>): boolean {
  return ['quest-hand-left', 'quest-hand-right'].some((id) => (
    states[id] === 'live' || states[id] === 'stale' || states[id] === 'recorded'
  ));
}

export function collectionPreviewState(
  session: HumanoidCaptureSession,
  telemetry: CollectionTelemetrySnapshot | null,
  streamId: string,
  now: number,
  unavailable: boolean,
): MediaStreamState {
  if (unavailable) return 'offline';
  const policy = session.humanDemonstration?.profile.streams.find((stream) => stream.streamId === streamId);
  const source = session.humanDemonstration?.sourceBindings.find((binding) => binding.role === policy?.sourceRole);
  if (source?.state === 'offline' || source?.state === 'error') return 'offline';
  if (telemetry !== null) {
    const age = now - telemetry.observedAtMs;
    if (age >= telemetry.freshness.offlineAfterMs) return 'offline';
    if (age >= telemetry.freshness.staleAfterMs) return 'stale';
  }
  if (source?.state === 'pending' || source?.state === 'paired') return 'idle';
  if (source?.state === 'stale') return 'stale';
  const stream = telemetry?.streams.find((item) => item.streamId === streamId);
  if (stream === undefined) return 'idle';
  if (stream.connectionState === 'offline') return 'offline';
  if (stream.connectionState === 'stale') return 'stale';
  if (stream.lastSampleAtMs !== null && telemetry !== null) {
    const age = now - stream.lastSampleAtMs;
    if (age >= telemetry.freshness.offlineAfterMs) return 'offline';
    if (age >= telemetry.freshness.staleAfterMs) return 'stale';
  }
  return 'live';
}
