import { describe, expect, it } from 'vitest';

import {
  HAND_JOINT_NAMES,
  type HandPoseFrame,
  type HandPoseObservation,
} from '../model/hand-pose';
import {
  decodeHandPoseBatch,
  encodeHandPoseBatch,
} from './hand-pose-binary';
import { HandPoseFrameQueue } from './hand-pose-frame-queue';

function observedHand(offset: number): HandPoseObservation {
  return {
    sourcePresent: true,
    poseObserved: true,
    joints: HAND_JOINT_NAMES.map((name, index) => ({
      name,
      positionMeters: [offset + index / 100, 1 + index / 200, -0.3] as const,
      orientationQuaternion: [0, 0, 0, 1] as const,
      radiusMeters: index === 0 ? null : 0.008,
    })),
  };
}

function frame(sequence: number): HandPoseFrame {
  return {
    schemaVersion: 1,
    sessionId: 'capture-hd-001',
    episodeId: 'episode-fw-001',
    sourceDeviceId: 'quest2-001',
    sequence,
    deviceMonotonicTimestampMs: 12_345.5 + sequence,
    clockDomain: 'webxr-dom-high-res-time',
    coordinateFrame: 'quest-local-floor',
    frameEpoch: 2,
    hands: {
      left: observedHand(-0.2),
      right: { sourcePresent: true, poseObserved: false, joints: [] },
    },
  };
}

describe('Hand Pose binary contract', () => {
  it('versioned batch를 왕복하며 손 단위 누락과 25개 표준 joint 순서를 보존한다', () => {
    const decoded = decodeHandPoseBatch(encodeHandPoseBatch([frame(7), frame(8)]));

    expect(decoded).toHaveLength(2);
    expect(decoded[0]).toMatchObject({
      schemaVersion: 1,
      sessionId: 'capture-hd-001',
      episodeId: 'episode-fw-001',
      sourceDeviceId: 'quest2-001',
      sequence: 7,
      clockDomain: 'webxr-dom-high-res-time',
      coordinateFrame: 'quest-local-floor',
      frameEpoch: 2,
      hands: {
        left: { sourcePresent: true, poseObserved: true },
        right: { sourcePresent: true, poseObserved: false, joints: [] },
      },
    });
    expect(decoded[0]?.hands.left.joints.map((joint) => joint.name)).toEqual(HAND_JOINT_NAMES);
    expect(decoded[0]?.hands.left.joints[0]?.radiusMeters).toBeNull();
    expect(decoded[0]?.hands.left.joints[1]?.positionMeters[0]).toBeCloseTo(-0.19, 5);
  });

  it('잘린 payload, 알 수 없는 version과 한 손의 불완전 joint 배열을 거부한다', () => {
    const encoded = encodeHandPoseBatch([frame(1)]);
    const wrongVersion = encoded.slice(0);
    new DataView(wrongVersion).setUint8(4, 2);
    expect(() => decodeHandPoseBatch(wrongVersion)).toThrow('codec version');

    expect(() => decodeHandPoseBatch(encoded.slice(0, encoded.byteLength - 1))).toThrow('payload 길이');

    const invalidFrame: HandPoseFrame = {
      ...frame(2),
      hands: {
        ...frame(2).hands,
        left: { ...observedHand(0), joints: observedHand(0).joints.slice(0, 24) },
      },
    };
    expect(() => encodeHandPoseBatch([invalidFrame])).toThrow('25개 표준 joint');
  });
});

describe('HandPoseFrameQueue', () => {
  it('drop-oldest 정책으로 queue와 재시도 복원을 capacity 안에 제한한다', () => {
    const queue = new HandPoseFrameQueue(2);
    queue.enqueue(frame(1));
    queue.enqueue(frame(2));
    queue.enqueue(frame(3));

    expect(queue.size).toBe(2);
    expect(queue.droppedFrameCount).toBe(1);
    expect(queue.take(1).map((item) => item.sequence)).toEqual([2]);
    queue.restoreFront([frame(0), frame(1)]);
    expect(queue.size).toBe(2);
    expect(queue.droppedFrameCount).toBe(2);
    expect(queue.take(2).map((item) => item.sequence)).toEqual([1, 3]);
  });
});
