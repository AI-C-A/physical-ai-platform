import type { CollectionBodyPoseTelemetry, CollectionHeadPerception } from '../model/flywheel';

// RGB 샘플과 함께 사용하는 시뮬레이션 결과. 실제 adapter는 관측한 결과만 전달한다.
export function createCollectionVisuals(atMs: number, sourceStreamId: string): {
  readonly bodyPose: CollectionBodyPoseTelemetry;
  readonly headPerception: CollectionHeadPerception;
} {
  return {
    bodyPose: {
      coordinateFrame: 'external-camera-floor', sourceStreamId: 'external-fullbody-rgb', receivedTimestampMs: atMs,
      joints: [
        { name: 'head', positionMeters: [0, 1.72, 0] },
        { name: 'neck', positionMeters: [0, 1.5, 0] },
        { name: 'pelvis', positionMeters: [0, 0.96, 0] },
        { name: 'left-shoulder', positionMeters: [-0.23, 1.45, 0] },
        { name: 'left-elbow', positionMeters: [-0.34, 1.17, 0.1] },
        { name: 'left-wrist', positionMeters: [-0.25, 1.12, 0.4] },
        { name: 'right-shoulder', positionMeters: [0.23, 1.45, 0] },
        { name: 'right-elbow', positionMeters: [0.34, 1.17, 0.1] },
        { name: 'right-wrist', positionMeters: [0.25, 1.12, 0.4] },
        { name: 'left-hip', positionMeters: [-0.12, 0.93, 0] },
        { name: 'left-knee', positionMeters: [-0.14, 0.51, 0.03] },
        { name: 'left-ankle', positionMeters: [-0.16, 0.09, 0] },
        { name: 'right-hip', positionMeters: [0.12, 0.93, 0] },
        { name: 'right-knee', positionMeters: [0.14, 0.51, 0.03] },
        { name: 'right-ankle', positionMeters: [0.16, 0.09, 0] },
      ],
    },
    headPerception: {
      sourceStreamId, receivedTimestampMs: atMs, depthKind: 'relative',
      depthImageUrl: '/assets/flywheel/humanoid-camera-head-depth.png',
      segmentationMaskUrl: '/assets/flywheel/humanoid-camera-head-mask.svg',
      labels: ['손·팔', '과일', '트레이'],
    },
  };
}
