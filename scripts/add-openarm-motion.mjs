import { readFileSync, writeFileSync } from 'node:fs';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BINARY_CHUNK_TYPE = 0x004e4942;
const FLOAT_COMPONENT_TYPE = 5126;
const ANIMATION_NAME = 'Episode Preview';

const motionTracks = [
  {
    angles: [0, -0.3, -0.55, -0.2, -0.1, 0],
    axis: [0, 0, 1],
    nodeName: 'openarm_left_link1',
  },
  {
    angles: [0, -0.35, -0.8, -0.55, -0.2, 0],
    axis: [-1, 0, 0],
    nodeName: 'openarm_left_link2',
  },
  {
    angles: [0, 0.25, 0.45, -0.25, -0.15, 0],
    axis: [0, 0, 1],
    nodeName: 'openarm_left_link3',
  },
  {
    angles: [0, 0.55, 1.25, 0.85, 0.35, 0],
    axis: [0, 1, 0],
    nodeName: 'openarm_left_link4',
  },
  {
    angles: [0, -0.2, 0.2, -0.15, 0.15, 0],
    axis: [0, 0, 1],
    nodeName: 'openarm_left_link5',
  },
  {
    angles: [0, 0.15, 0.35, -0.2, -0.1, 0],
    axis: [1, 0, 0],
    nodeName: 'openarm_left_link6',
  },
  {
    angles: [0, -0.15, 0.35, 0.2, -0.2, 0],
    axis: [0, -1, 0],
    nodeName: 'openarm_left_link7',
  },
  {
    angles: [0, 0.1, 0.25, 0.55, 0.3, 0],
    axis: [0, 0, 1],
    nodeName: 'openarm_right_link1',
  },
  {
    angles: [0, 0.2, 0.4, 0.8, 0.35, 0],
    axis: [-1, 0, 0],
    nodeName: 'openarm_right_link2',
  },
  {
    angles: [0, -0.15, -0.25, 0.45, 0.25, 0],
    axis: [0, 0, 1],
    nodeName: 'openarm_right_link3',
  },
  {
    angles: [0, 0.35, 0.8, 1.25, 0.55, 0],
    axis: [0, 1, 0],
    nodeName: 'openarm_right_link4',
  },
  {
    angles: [0, 0.15, -0.15, 0.2, -0.2, 0],
    axis: [0, 0, 1],
    nodeName: 'openarm_right_link5',
  },
  {
    angles: [0, -0.1, -0.2, 0.35, 0.15, 0],
    axis: [1, 0, 0],
    nodeName: 'openarm_right_link6',
  },
  {
    angles: [0, 0.2, -0.2, -0.35, 0.15, 0],
    axis: [0, 1, 0],
    nodeName: 'openarm_right_link7',
  },
];

const keyframeTimes = [0, 1.2, 2.4, 3.6, 4.8, 6];

function alignToFour(value) {
  return (value + 3) & ~3;
}

function readGlb(path) {
  const file = readFileSync(path);
  if (file.readUInt32LE(0) !== GLB_MAGIC || file.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error('Expected a glTF 2.0 binary file.');
  }

  let json = null;
  let binary = null;
  let offset = 12;
  while (offset < file.length) {
    const length = file.readUInt32LE(offset);
    const type = file.readUInt32LE(offset + 4);
    const chunk = file.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK_TYPE) {
      json = JSON.parse(chunk.toString('utf8').trim());
    } else if (type === BINARY_CHUNK_TYPE) {
      binary = chunk;
    }
    offset += 8 + length;
  }

  if (json === null || binary === null || json.buffers?.length !== 1) {
    throw new Error('Expected one JSON chunk and one embedded binary buffer.');
  }
  return { binary, json };
}

function quaternionFromMatrix(matrix) {
  const m00 = matrix[0];
  const m01 = matrix[4];
  const m02 = matrix[8];
  const m10 = matrix[1];
  const m11 = matrix[5];
  const m12 = matrix[9];
  const m20 = matrix[2];
  const m21 = matrix[6];
  const m22 = matrix[10];
  const trace = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;

  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    w = 0.25 * scale;
    x = (m21 - m12) / scale;
    y = (m02 - m20) / scale;
    z = (m10 - m01) / scale;
  } else if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / scale;
    x = 0.25 * scale;
    y = (m01 + m10) / scale;
    z = (m02 + m20) / scale;
  } else if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / scale;
    x = (m01 + m10) / scale;
    y = 0.25 * scale;
    z = (m12 + m21) / scale;
  } else {
    const scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / scale;
    x = (m02 + m20) / scale;
    y = (m12 + m21) / scale;
    z = 0.25 * scale;
  }

  const length = Math.hypot(x, y, z, w);
  return [x / length, y / length, z / length, w / length];
}

function multiplyQuaternions(left, right) {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function axisAngleQuaternion(axis, angle) {
  const axisLength = Math.hypot(...axis);
  const sinHalfAngle = Math.sin(angle / 2);
  return [
    axis[0] / axisLength * sinHalfAngle,
    axis[1] / axisLength * sinHalfAngle,
    axis[2] / axisLength * sinHalfAngle,
    Math.cos(angle / 2),
  ];
}

function keepQuaternionContinuity(quaternions) {
  for (let index = 1; index < quaternions.length; index += 1) {
    const previous = quaternions[index - 1];
    const current = quaternions[index];
    const dot = previous.reduce((sum, value, component) => (
      sum + value * current[component]
    ), 0);
    if (dot < 0) quaternions[index] = current.map((value) => -value);
  }
  return quaternions;
}

function writeGlb(path, json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJsonLength = alignToFour(jsonBytes.length);
  const paddedBinaryLength = alignToFour(binary.length);
  const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinaryLength;
  const output = Buffer.alloc(totalLength);

  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  jsonBytes.copy(output, 20);
  output.fill(0x20, 20 + jsonBytes.length, 20 + paddedJsonLength);

  const binaryHeaderOffset = 20 + paddedJsonLength;
  output.writeUInt32LE(paddedBinaryLength, binaryHeaderOffset);
  output.writeUInt32LE(BINARY_CHUNK_TYPE, binaryHeaderOffset + 4);
  binary.copy(output, binaryHeaderOffset + 8);
  writeFileSync(path, output);
}

const [inputPath, outputPath] = process.argv.slice(2);
if (inputPath === undefined || outputPath === undefined) {
  throw new Error('Usage: node scripts/add-openarm-motion.mjs <input.glb> <output.glb>');
}

const { binary: sourceBinary, json } = readGlb(inputPath);
if ((json.animations?.length ?? 0) > 0) {
  throw new Error('Input model already contains animation clips.');
}

json.bufferViews ??= [];
json.accessors ??= [];
const sourceLength = json.buffers[0].byteLength;
let binary = Buffer.alloc(alignToFour(sourceLength));
sourceBinary.copy(binary, 0, 0, sourceLength);

function appendFloatData(values) {
  const offset = alignToFour(binary.length);
  const data = Buffer.alloc(values.length * Float32Array.BYTES_PER_ELEMENT);
  values.forEach((value, index) => data.writeFloatLE(value, index * 4));
  if (offset !== binary.length) binary = Buffer.concat([binary, Buffer.alloc(offset - binary.length)]);
  binary = Buffer.concat([binary, data]);
  return { byteLength: data.length, byteOffset: offset };
}

const timeBuffer = appendFloatData(keyframeTimes);
const timeBufferView = json.bufferViews.push({
  buffer: 0,
  byteLength: timeBuffer.byteLength,
  byteOffset: timeBuffer.byteOffset,
}) - 1;
const timeAccessor = json.accessors.push({
  bufferView: timeBufferView,
  componentType: FLOAT_COMPONENT_TYPE,
  count: keyframeTimes.length,
  max: [keyframeTimes.at(-1)],
  min: [keyframeTimes[0]],
  type: 'SCALAR',
}) - 1;

const samplers = [];
const channels = [];
for (const track of motionTracks) {
  const nodeIndex = json.nodes.findIndex((node) => node.name === track.nodeName);
  if (nodeIndex < 0) throw new Error(`Missing OpenArm joint node: ${track.nodeName}`);
  if (track.angles.length !== keyframeTimes.length) {
    throw new Error(`Invalid keyframe count for ${track.nodeName}`);
  }

  const node = json.nodes[nodeIndex];
  if (!Array.isArray(node.matrix) || node.matrix.length !== 16) {
    throw new Error(`Expected a matrix transform on ${track.nodeName}`);
  }
  const baseRotation = quaternionFromMatrix(node.matrix);
  node.translation = [node.matrix[12], node.matrix[13], node.matrix[14]];
  node.rotation = baseRotation;
  delete node.matrix;

  const rotations = keepQuaternionContinuity(track.angles.map((angle) => (
    multiplyQuaternions(baseRotation, axisAngleQuaternion(track.axis, angle))
  ))).flat();
  const rotationBuffer = appendFloatData(rotations);
  const rotationBufferView = json.bufferViews.push({
    buffer: 0,
    byteLength: rotationBuffer.byteLength,
    byteOffset: rotationBuffer.byteOffset,
  }) - 1;
  const rotationAccessor = json.accessors.push({
    bufferView: rotationBufferView,
    componentType: FLOAT_COMPONENT_TYPE,
    count: keyframeTimes.length,
    type: 'VEC4',
  }) - 1;
  const sampler = samplers.push({
    input: timeAccessor,
    interpolation: 'LINEAR',
    output: rotationAccessor,
  }) - 1;
  channels.push({ sampler, target: { node: nodeIndex, path: 'rotation' } });
}

json.animations = [{ channels, name: ANIMATION_NAME, samplers }];
json.buffers[0].byteLength = binary.length;
writeGlb(outputPath, json, binary);
console.log(`Added ${ANIMATION_NAME}: ${channels.length} joints, ${keyframeTimes.at(-1)} seconds.`);
