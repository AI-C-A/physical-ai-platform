import type { HumanDemonstrationProfile } from './flywheel';

export const questCollectionProfile: HumanDemonstrationProfile = {
  id: 'quest-hand-collection-v1', schemaVersion: 1,
  handTracking: { requiredHands: 'both', targetRateHz: 60, queueCapacityFrames: 600,
    maximumBatchFrames: 64, flushIntervalMs: 50, partialAfterMs: 250, lostAfterMs: 1_500 },
  streams: (['left', 'right'] as const).map((side) => ({
    streamId: `quest-hand-${side}`, displayName: side === 'left' ? '왼손 추적' : '오른손 추적',
    modality: 'hand-pose', origin: 'sensor', sourceRole: 'xr-hand-tracking', required: true,
    targetRateHz: null, coordinateFrame: 'quest-local-floor', maximumDriftMs: null, minimumCompletenessPercent: null,
  })),
};
