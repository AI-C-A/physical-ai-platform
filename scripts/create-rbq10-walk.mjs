import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

// 재생성: node scripts/create-rbq10-walk.mjs
// 미리보기용으로 제작한 동작이며 실제 녹화나 하드웨어 제어 궤적이 아니다.
// 원본 형상과 내장 텍스처 바이트는 보존하고 애니메이션 데이터만 추가한다.
// glTF 애니메이션 형식: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations
const sourceUrl = new URL('../public/assets/rbq10_textured.glb', import.meta.url);
const outputUrl = new URL('../public/assets/rbq10_walk.glb', import.meta.url);
const source = await readFile(sourceUrl);
assert.equal(source.toString('ascii', 0, 4), 'glTF');
assert.equal(source.readUInt32LE(4), 2);
assert.equal(source.readUInt32LE(8), source.length);
const jsonLength = source.readUInt32LE(12);
const document = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
assert.equal(document.buffers.length, 1);
assert.equal(document.buffers[0].uri, undefined);
assert.equal(document.animations?.length ?? 0, 0);
const originalBinary = source.subarray(28 + jsonLength, 28 + jsonLength + document.buffers[0].byteLength);

const duration = 0.8;
const framesPerSecond = 60;
const frameCount = Math.round(duration * framesPerSecond);
// 착지 구간을 짧게 겹치면서 대각선 다리를 교대로 움직인다.
// 작은 미리보기에서도 각 다리의 동작이 이어지는 보행으로 보이도록 한다.
const dutyFactor = 0.625;
const stride = 0.28;
const footLift = 0.04;
const bodyHeight = 0.535;
const upperLength = 0.33;
const lowerLength = 0.33;
const legs = [
  { name: 'FL', swingStart: 0, side: 1 },
  { name: 'RR', swingStart: 0, side: -1 },
  { name: 'FR', swingStart: 0.5, side: -1 },
  { name: 'RL', swingStart: 0.5, side: 1 },
];
const indexOf = (name) => {
  const index = document.nodes.findIndex((node) => node.name === name);
  assert.notEqual(index, -1, `Missing joint: ${name}`);
  return index;
};

// 애니메이션 대상 노드만 행렬을 TRS로 변환한다. 원본 행렬에는 이동만 있으며
// 시각 노드의 변환 데이터는 그대로 보존한다.
function animatedNode(name) {
  const index = indexOf(name);
  const node = document.nodes[index];
  if (node.matrix) {
    const matrix = [...node.matrix];
    node.translation = matrix.splice(12, 3, 0, 0, 0);
    assert.deepEqual(matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    delete node.matrix;
  }
  return index;
}

function positions(name) {
  const node = document.nodes[indexOf(name)];
  const mesh = document.meshes[node.mesh];
  const accessor = document.accessors[mesh.primitives[0].attributes.POSITION];
  const view = document.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  assert.equal(accessor.type, 'VEC3');
  return Array.from({ length: accessor.count }, (_, index) => [0, 1, 2].map((axis) => (
    originalBinary.readFloatLE((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      + index * (view.byteStride ?? 12) + axis * 4)
  )));
}

const smoothstep = (value) => value ** 3 * (10 - 15 * value + 6 * value ** 2);
function footPath(cycle, swingStart) {
  const phase = (cycle + dutyFactor - swingStart + 1) % 1;
  if (phase < dutyFactor) return { x: stride * (0.5 - phase / dutyFactor), z: 0 };
  const progress = (phase - dutyFactor) / (1 - dutyFactor);
  // 발이 튀지 않도록 스윙 양 끝에서 지지 구간의 속도를 맞춘다.
  const tangent = -stride * (1 - dutyFactor) / dutyFactor;
  return {
    x: -stride / 2 + tangent * progress + (stride - tangent) * smoothstep(progress),
    z: footLift * Math.sin(Math.PI * progress) ** 2,
  };
}

function solveLeg(x, y, z, side) {
  const hipOffset = side * 0.10285;
  const height = Math.sqrt(y * y + z * z - hipOffset * hipOffset);
  let hip = Math.atan2(z, y) - Math.atan2(-height, hipOffset);
  hip = Math.atan2(Math.sin(hip), Math.cos(hip));
  const cosine = (x * x + height * height - upperLength ** 2 - lowerLength ** 2)
    / (2 * upperLength * lowerLength);
  assert.ok(cosine >= -1 && cosine <= 1, 'Foot target is outside the leg workspace');
  const calf = -Math.acos(cosine);
  // 공식 RBQ 모델의 무릎 가동 범위 안에서 기구적으로 유효한 IK 해를 유지한다.
  // https://github.com/RainbowRobotics/RBQ/blob/main/resources/model/rbq/rbq.xml
  assert.ok(calf >= -2.8274 && calf <= -0.4189, 'Knee exceeds the RBQ joint range');
  const thigh = Math.atan2(-x, height)
    - Math.atan2(lowerLength * Math.sin(calf), upperLength + lowerLength * Math.cos(calf));
  return { hip, thigh, calf };
}

function lowestCalfPoint(pose, vertices, side, bodyZ) {
  const { hip, thigh, calf } = pose;
  const kneeZ = -upperLength * Math.cos(thigh);
  const total = thigh + calf;
  let minimum = Infinity;
  for (const [x, y, z] of vertices) {
    const sagittalZ = kneeZ - Math.sin(total) * x + Math.cos(total) * z;
    const worldZ = bodyZ + Math.sin(hip) * (side * 0.10285 + y) + Math.cos(hip) * sagittalZ;
    minimum = Math.min(minimum, worldZ);
  }
  return minimum;
}

const axisQuaternion = (axis, angle) => {
  const value = [0, 0, 0, Math.cos(angle / 2)];
  value[axis] = Math.sin(angle / 2);
  return value;
};
const bodyIndex = animatedNode('RBQ10');
const bodyValues = [];
for (const leg of legs) {
  leg.hipIndex = animatedNode(`${leg.name}_hip`);
  leg.thighIndex = animatedNode(`${leg.name}_thigh`);
  leg.calfIndex = animatedNode(`${leg.name}_calf`);
  leg.vertices = positions(`${leg.name}_calf_visual`);
  leg.hipValues = [];
  leg.thighValues = [];
  leg.calfValues = [];
}

for (let frame = 0; frame <= frameCount; frame += 1) {
  // 반복 경계가 이어지도록 마지막 프레임에 첫 샘플을 그대로 사용한다.
  const cycle = (frame % frameCount) / frameCount;
  const bodyY = 0.002 * Math.sin(2 * Math.PI * cycle);
  const bodyZ = bodyHeight + 0.004 * Math.cos(4 * Math.PI * cycle);
  bodyValues.push(0, bodyY, bodyZ);
  for (const leg of legs) {
    const target = footPath(cycle, leg.swingStart);
    let ankleZ = 0.03 + target.z;
    let pose;
    // 발 기준점 아래의 오프셋까지 포함해 실제 발바닥 형상을 지면에 맞춘다.
    for (let iteration = 0; iteration < 12; iteration += 1) {
      pose = solveLeg(target.x, leg.side * 0.10285 - bodyY, ankleZ - bodyZ, leg.side);
      const error = target.z - lowestCalfPoint(pose, leg.vertices, leg.side, bodyZ);
      if (Math.abs(error) < 1e-8) break;
      ankleZ += error;
    }
    assert.ok(Math.abs(lowestCalfPoint(pose, leg.vertices, leg.side, bodyZ) - target.z) < 1e-6);
    leg.hipValues.push(...axisQuaternion(0, pose.hip));
    leg.thighValues.push(...axisQuaternion(1, pose.thigh));
    leg.calfValues.push(...axisQuaternion(1, pose.calf));
  }
}

const binaryChunks = [originalBinary];
let byteLength = originalBinary.length;
function appendAccessor(values, type) {
  const componentCount = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  const padding = (4 - byteLength % 4) % 4;
  binaryChunks.push(Buffer.alloc(padding));
  byteLength += padding;
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  const bufferView = document.bufferViews.length;
  document.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length });
  const index = document.accessors.length;
  document.accessors.push({
    bufferView, componentType: 5126, count: values.length / componentCount, type,
    ...(type === 'SCALAR' ? { min: [Math.fround(Math.min(...values))], max: [Math.fround(Math.max(...values))] } : {}),
  });
  binaryChunks.push(bytes);
  byteLength += bytes.length;
  return index;
}

const timeAccessor = appendAccessor(Array.from({ length: frameCount + 1 }, (_, index) => index / framesPerSecond), 'SCALAR');
const animation = {
  name: 'Walk', channels: [], samplers: [],
  extras: {
    description: 'Authored in-place diagonal trot for the monitoring preview; not recorded robot telemetry.',
    duration, framesPerSecond, dutyFactor, stride, footLift,
    swingGroups: [['FL', 'RR'], ['FR', 'RL']],
  },
};
function addTrack(node, path, values, type) {
  const size = type === 'VEC4' ? 4 : 3;
  assert.deepEqual(values.slice(0, size), values.slice(-size));
  document.nodes[node][path] = values.slice(0, size);
  animation.channels.push({ sampler: animation.samplers.length, target: { node, path } });
  animation.samplers.push({ input: timeAccessor, output: appendAccessor(values, type), interpolation: 'LINEAR' });
}
addTrack(bodyIndex, 'translation', bodyValues, 'VEC3');
for (const leg of legs) {
  addTrack(leg.hipIndex, 'rotation', leg.hipValues, 'VEC4');
  addTrack(leg.thighIndex, 'rotation', leg.thighValues, 'VEC4');
  addTrack(leg.calfIndex, 'rotation', leg.calfValues, 'VEC4');
}
document.animations = [animation];
document.scenes[0].extras.joint_pose = 'Walk frame 0';
document.buffers[0].byteLength = byteLength;

const jsonBytes = Buffer.from(JSON.stringify(document));
const jsonPadded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
jsonBytes.copy(jsonPadded);
const binary = Buffer.concat(binaryChunks);
assert.deepEqual(binary.subarray(0, originalBinary.length), originalBinary);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonPadded.length + binary.length, 8);
header.writeUInt32LE(jsonPadded.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(binary.length, 0);
binaryHeader.writeUInt32LE(0x004e4942, 4);
const output = Buffer.concat([header, jsonPadded, binaryHeader, binary]);
await writeFile(outputUrl, output);
console.log(JSON.stringify({ output: outputUrl.pathname, bytes: output.length, animation: animation.name,
  duration, frames: frameCount + 1, tracks: animation.channels.length, embeddedTextures: document.images.length }, null, 2));
