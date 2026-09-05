import {
  HAND_JOINT_NAMES,
  type HandJointPose,
  type HandPoseFrame,
  type HandPoseObservation,
  type Handedness,
} from '../model/hand-pose';

export const HAND_POSE_BATCH_CODEC_VERSION = 1;

const batchHeaderBytes = 12;
const frameFixedBytes = 24;
const jointBytes = 32;
const maximumIdentifierBytes = 1_024;
const maximumFramesPerBatch = 255;
const magic = [0x48, 0x50, 0x54, 0x46] as const; // HPTF
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

interface EncodedIdentifier {
  readonly bytes: Uint8Array;
  readonly value: string;
}

function encodeIdentifier(value: string, label: string): EncodedIdentifier {
  const normalized = value.trim();
  const bytes = encoder.encode(normalized);
  if (normalized.length === 0 || bytes.byteLength > maximumIdentifierBytes) {
    throw new Error(`${label} 길이가 올바르지 않습니다.`);
  }
  return { bytes, value: normalized };
}

function assertFiniteTuple(values: readonly number[], label: string): void {
  if (!values.every(Number.isFinite)) throw new Error(`${label}에 유한하지 않은 값이 있습니다.`);
}

function assertObservation(observation: HandPoseObservation, handedness: Handedness): void {
  if (observation.poseObserved && !observation.sourcePresent) {
    throw new Error(`${handedness} 손 pose는 input source 없이 존재할 수 없습니다.`);
  }
  if (!observation.poseObserved && observation.joints.length !== 0) {
    throw new Error(`${handedness} 손 pose가 없을 때 joint를 전송할 수 없습니다.`);
  }
  if (!observation.poseObserved) return;
  if (observation.joints.length !== HAND_JOINT_NAMES.length) {
    throw new Error(`${handedness} 손 pose는 25개 표준 joint가 필요합니다.`);
  }
  observation.joints.forEach((joint, index) => {
    if (joint.name !== HAND_JOINT_NAMES[index]) {
      throw new Error(`${handedness} 손 joint 순서가 WebXR 표준과 다릅니다.`);
    }
    assertFiniteTuple(joint.positionMeters, `${handedness}.${joint.name}.position`);
    assertFiniteTuple(joint.orientationQuaternion, `${handedness}.${joint.name}.orientation`);
    if (joint.radiusMeters !== null && (!Number.isFinite(joint.radiusMeters) || joint.radiusMeters < 0)) {
      throw new Error(`${handedness}.${joint.name}.radius가 올바르지 않습니다.`);
    }
  });
}

function writeIdentifier(view: DataView, offset: number, identifier: EncodedIdentifier): number {
  view.setUint16(offset, identifier.bytes.byteLength, true);
  new Uint8Array(view.buffer, offset + 2, identifier.bytes.byteLength).set(identifier.bytes);
  return offset + 2 + identifier.bytes.byteLength;
}

function writeJoints(view: DataView, offset: number, joints: readonly HandJointPose[]): number {
  let cursor = offset;
  joints.forEach((joint) => {
    joint.positionMeters.forEach((value) => {
      view.setFloat32(cursor, value, true);
      cursor += 4;
    });
    joint.orientationQuaternion.forEach((value) => {
      view.setFloat32(cursor, value, true);
      cursor += 4;
    });
    view.setFloat32(cursor, joint.radiusMeters ?? Number.NaN, true);
    cursor += 4;
  });
  return cursor;
}

/**
 * 고정 joint 순서를 이용해 이름을 반복 전송하지 않는 versioned little-endian batch다.
 * Batch header의 payload 길이와 각 frame 길이를 모두 검증할 수 있다.
 */
export function encodeHandPoseBatch(frames: readonly HandPoseFrame[]): ArrayBuffer {
  if (frames.length === 0 || frames.length > maximumFramesPerBatch) {
    throw new Error('Hand Pose batch는 1개 이상 255개 이하 frame이어야 합니다.');
  }

  const prepared = frames.map((frame) => {
    if (frame.schemaVersion !== 1) throw new Error('지원하지 않는 Hand Pose schema version입니다.');
    if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0 || frame.sequence > 0xffff_ffff) {
      throw new Error('Hand Pose sequence가 uint32 범위를 벗어났습니다.');
    }
    if (!Number.isFinite(frame.deviceMonotonicTimestampMs) || frame.deviceMonotonicTimestampMs < 0) {
      throw new Error('장치 monotonic timestamp가 올바르지 않습니다.');
    }
    if (!Number.isSafeInteger(frame.frameEpoch) || frame.frameEpoch < 0 || frame.frameEpoch > 0xffff_ffff) {
      throw new Error('Hand Pose frame epoch가 uint32 범위를 벗어났습니다.');
    }
    assertObservation(frame.hands.left, 'left');
    assertObservation(frame.hands.right, 'right');
    const identifiers = [
      encodeIdentifier(frame.sessionId, 'sessionId'),
      encodeIdentifier(frame.episodeId, 'episodeId'),
      encodeIdentifier(frame.sourceDeviceId, 'sourceDeviceId'),
      encodeIdentifier(frame.coordinateFrame, 'coordinateFrame'),
    ] as const;
    const identifierBytes = identifiers.reduce((total, item) => total + 2 + item.bytes.byteLength, 0);
    const poseBytes = [frame.hands.left, frame.hands.right]
      .reduce((total, hand) => total + (hand.poseObserved ? HAND_JOINT_NAMES.length * jointBytes : 0), 0);
    return { frame, identifiers, byteLength: frameFixedBytes + identifierBytes + poseBytes };
  });

  const totalBytes = batchHeaderBytes + prepared.reduce((total, item) => total + item.byteLength, 0);
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  magic.forEach((value, index) => view.setUint8(index, value));
  view.setUint8(4, HAND_POSE_BATCH_CODEC_VERSION);
  view.setUint8(5, frames.length);
  view.setUint16(6, 0, true);
  view.setUint32(8, totalBytes - batchHeaderBytes, true);

  let offset = batchHeaderBytes;
  prepared.forEach(({ frame, identifiers, byteLength }) => {
    const frameStart = offset;
    view.setUint32(offset, byteLength, true);
    offset += 4;
    view.setUint32(offset, frame.sequence, true);
    offset += 4;
    view.setFloat64(offset, frame.deviceMonotonicTimestampMs, true);
    offset += 8;
    view.setUint32(offset, frame.frameEpoch, true);
    offset += 4;
    const flags = (frame.hands.left.sourcePresent ? 1 : 0)
      | (frame.hands.left.poseObserved ? 2 : 0)
      | (frame.hands.right.sourcePresent ? 4 : 0)
      | (frame.hands.right.poseObserved ? 8 : 0);
    view.setUint8(offset, flags);
    offset += 1;
    view.setUint8(offset, 0);
    view.setUint16(offset + 1, 0, true);
    offset += 3;
    identifiers.forEach((identifier) => {
      offset = writeIdentifier(view, offset, identifier);
    });
    if (frame.hands.left.poseObserved) offset = writeJoints(view, offset, frame.hands.left.joints);
    if (frame.hands.right.poseObserved) offset = writeJoints(view, offset, frame.hands.right.joints);
    if (offset !== frameStart + byteLength) throw new Error('Hand Pose frame 길이 계산이 일치하지 않습니다.');
  });
  return buffer;
}

function normalizeBinary(input: unknown): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    const copy = new ArrayBuffer(input.byteLength);
    new Uint8Array(copy).set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    return copy;
  }
  throw new Error('Hand Pose batch는 binary 데이터여야 합니다.');
}

function readIdentifier(view: DataView, offset: number, frameEnd: number): { readonly value: string; readonly next: number } {
  if (offset + 2 > frameEnd) throw new Error('Hand Pose identifier 길이가 잘렸습니다.');
  const length = view.getUint16(offset, true);
  if (length === 0 || length > maximumIdentifierBytes || offset + 2 + length > frameEnd) {
    throw new Error('Hand Pose identifier 길이가 올바르지 않습니다.');
  }
  let value: string;
  try {
    value = decoder.decode(new Uint8Array(view.buffer, offset + 2, length));
  } catch {
    throw new Error('Hand Pose identifier가 올바른 UTF-8이 아닙니다.');
  }
  if (value.trim().length === 0) throw new Error('Hand Pose identifier는 비어 있을 수 없습니다.');
  return { value, next: offset + 2 + length };
}

function readJoints(view: DataView, offset: number, frameEnd: number): { readonly joints: readonly HandJointPose[]; readonly next: number } {
  const requiredBytes = HAND_JOINT_NAMES.length * jointBytes;
  if (offset + requiredBytes > frameEnd) throw new Error('Hand Pose joint payload가 잘렸습니다.');
  let cursor = offset;
  const joints = HAND_JOINT_NAMES.map((name) => {
    const position = [0, 0, 0].map(() => {
      const value = view.getFloat32(cursor, true);
      cursor += 4;
      return value;
    }) as [number, number, number];
    const orientation = [0, 0, 0, 0].map(() => {
      const value = view.getFloat32(cursor, true);
      cursor += 4;
      return value;
    }) as [number, number, number, number];
    const radius = view.getFloat32(cursor, true);
    cursor += 4;
    assertFiniteTuple(position, `${name}.position`);
    assertFiniteTuple(orientation, `${name}.orientation`);
    if (!Number.isNaN(radius) && (!Number.isFinite(radius) || radius < 0)) {
      throw new Error(`${name}.radius가 올바르지 않습니다.`);
    }
    return {
      name,
      positionMeters: position,
      orientationQuaternion: orientation,
      radiusMeters: Number.isNaN(radius) ? null : radius,
    } satisfies HandJointPose;
  });
  return { joints, next: cursor };
}

function observation(sourcePresent: boolean, poseObserved: boolean, joints: readonly HandJointPose[]): HandPoseObservation {
  if (poseObserved && !sourcePresent) throw new Error('Hand Pose flag 조합이 올바르지 않습니다.');
  return { sourcePresent, poseObserved, joints };
}

export function decodeHandPoseBatch(input: unknown): readonly HandPoseFrame[] {
  const buffer = normalizeBinary(input);
  if (buffer.byteLength < batchHeaderBytes) throw new Error('Hand Pose batch header가 잘렸습니다.');
  const view = new DataView(buffer);
  magic.forEach((value, index) => {
    if (view.getUint8(index) !== value) throw new Error('Hand Pose batch magic이 올바르지 않습니다.');
  });
  if (view.getUint8(4) !== HAND_POSE_BATCH_CODEC_VERSION) {
    throw new Error('지원하지 않는 Hand Pose batch codec version입니다.');
  }
  const frameCount = view.getUint8(5);
  if (frameCount === 0) throw new Error('Hand Pose batch에 frame이 없습니다.');
  if (view.getUint16(6, true) !== 0) throw new Error('Hand Pose batch reserved field가 올바르지 않습니다.');
  if (view.getUint32(8, true) !== buffer.byteLength - batchHeaderBytes) {
    throw new Error('Hand Pose batch payload 길이가 일치하지 않습니다.');
  }

  const frames: HandPoseFrame[] = [];
  let offset = batchHeaderBytes;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    if (offset + frameFixedBytes > buffer.byteLength) throw new Error('Hand Pose frame header가 잘렸습니다.');
    const frameStart = offset;
    const frameLength = view.getUint32(offset, true);
    const frameEnd = frameStart + frameLength;
    if (frameLength < frameFixedBytes || frameEnd > buffer.byteLength) {
      throw new Error('Hand Pose frame 길이가 올바르지 않습니다.');
    }
    offset += 4;
    const sequence = view.getUint32(offset, true);
    offset += 4;
    const deviceMonotonicTimestampMs = view.getFloat64(offset, true);
    offset += 8;
    if (!Number.isFinite(deviceMonotonicTimestampMs) || deviceMonotonicTimestampMs < 0) {
      throw new Error('장치 monotonic timestamp가 올바르지 않습니다.');
    }
    const frameEpoch = view.getUint32(offset, true);
    offset += 4;
    const flags = view.getUint8(offset);
    offset += 1;
    if ((flags & 0xf0) !== 0 || view.getUint8(offset) !== 0 || view.getUint16(offset + 1, true) !== 0) {
      throw new Error('Hand Pose frame flags 또는 reserved field가 올바르지 않습니다.');
    }
    offset += 3;
    const identifiers: string[] = [];
    for (let identifierIndex = 0; identifierIndex < 4; identifierIndex += 1) {
      const decoded = readIdentifier(view, offset, frameEnd);
      identifiers.push(decoded.value);
      offset = decoded.next;
    }
    const [sessionId, episodeId, sourceDeviceId, coordinateFrame] = identifiers;
    if (sessionId === undefined || episodeId === undefined || sourceDeviceId === undefined) {
      throw new Error('Hand Pose frame identifier가 누락되었습니다.');
    }
    if (coordinateFrame !== 'quest-local-floor') throw new Error('지원하지 않는 Hand Pose 좌표계입니다.');
    const leftSourcePresent = (flags & 1) !== 0;
    const leftPoseObserved = (flags & 2) !== 0;
    const rightSourcePresent = (flags & 4) !== 0;
    const rightPoseObserved = (flags & 8) !== 0;
    const left = leftPoseObserved ? readJoints(view, offset, frameEnd) : { joints: [], next: offset };
    offset = left.next;
    const right = rightPoseObserved ? readJoints(view, offset, frameEnd) : { joints: [], next: offset };
    offset = right.next;
    if (offset !== frameEnd) throw new Error('Hand Pose frame에 해석되지 않은 데이터가 있습니다.');
    frames.push({
      schemaVersion: 1,
      sessionId,
      episodeId,
      sourceDeviceId,
      sequence,
      deviceMonotonicTimestampMs,
      clockDomain: 'webxr-dom-high-res-time',
      coordinateFrame: 'quest-local-floor',
      frameEpoch,
      hands: {
        left: observation(leftSourcePresent, leftPoseObserved, left.joints),
        right: observation(rightSourcePresent, rightPoseObserved, right.joints),
      },
    });
  }
  if (offset !== buffer.byteLength) throw new Error('Hand Pose batch 뒤에 불필요한 데이터가 있습니다.');
  return frames;
}
