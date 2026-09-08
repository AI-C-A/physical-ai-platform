import * as THREE from 'three';

import type { CollectionHandJointPose, CollectionHandPoseTelemetry } from '../model/flywheel';

export type HandPoseCoordinateMode = 'world' | 'hand-local';
export type HandPoseVisibility = 'both' | 'left' | 'right';

export const QUEST_HAND_BONES = [
  ['wrist', 'thumb-metacarpal'],
  ['thumb-metacarpal', 'thumb-phalanx-proximal'],
  ['thumb-phalanx-proximal', 'thumb-phalanx-distal'],
  ['thumb-phalanx-distal', 'thumb-tip'],
  ['wrist', 'index-finger-metacarpal'],
  ['index-finger-metacarpal', 'index-finger-phalanx-proximal'],
  ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate'],
  ['index-finger-phalanx-intermediate', 'index-finger-phalanx-distal'],
  ['index-finger-phalanx-distal', 'index-finger-tip'],
  ['wrist', 'middle-finger-metacarpal'],
  ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal'],
  ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate'],
  ['middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal'],
  ['middle-finger-phalanx-distal', 'middle-finger-tip'],
  ['wrist', 'ring-finger-metacarpal'],
  ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal'],
  ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate'],
  ['ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal'],
  ['ring-finger-phalanx-distal', 'ring-finger-tip'],
  ['wrist', 'pinky-finger-metacarpal'],
  ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal'],
  ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate'],
  ['pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal'],
  ['pinky-finger-phalanx-distal', 'pinky-finger-tip'],
] as const;

export const QUEST_HAND_JOINT_NAMES = [...new Set(QUEST_HAND_BONES.flat())];

const localHandOffsets = { left: -0.11, right: 0.11 } as const;

export function normalizedQuaternion(
  values: readonly [number, number, number, number],
): THREE.Quaternion {
  const quaternion = new THREE.Quaternion(...values);
  return quaternion.lengthSq() === 0 ? quaternion.identity() : quaternion.normalize();
}

export function transformHandJoint(
  joint: CollectionHandJointPose,
  wrist: CollectionHandJointPose,
  handedness: 'left' | 'right',
  mode: HandPoseCoordinateMode,
): readonly [number, number, number] {
  if (mode === 'world') return joint.positionMeters;
  const relative = new THREE.Vector3(
    joint.positionMeters[0] - wrist.positionMeters[0],
    joint.positionMeters[1] - wrist.positionMeters[1],
    joint.positionMeters[2] - wrist.positionMeters[2],
  );
  relative.applyQuaternion(normalizedQuaternion(wrist.orientationQuaternion).invert());
  return [relative.x + localHandOffsets[handedness], relative.y, relative.z];
}

/** World joint -> head-local: inverse(head rotation) * (joint - head position). */
export function transformJointToViewer(
  position: readonly [number, number, number],
  pose: NonNullable<CollectionHandPoseTelemetry['viewerPose']>,
): THREE.Vector3 {
  return new THREE.Vector3(...position)
    .sub(new THREE.Vector3(...pose.positionMeters))
    .applyQuaternion(normalizedQuaternion(pose.orientationQuaternion).invert());
}
