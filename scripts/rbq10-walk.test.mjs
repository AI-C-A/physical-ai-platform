import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AnimationMixer, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function readGlb(filename) {
  const bytes = await readFile(new URL(`../public/assets/${filename}`, import.meta.url));
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  return { json, binary: bytes.subarray(28 + jsonLength) };
}

const source = await readGlb('rbq10_textured.glb');
const animated = await readGlb('rbq10_walk.glb');

test('RBQ-10 walk preserves the original meshes, materials and embedded textures', () => {
  for (const key of ['meshes', 'materials', 'textures', 'images']) {
    assert.deepEqual(animated.json[key], source.json[key]);
  }
  assert.deepEqual(animated.binary.subarray(0, source.json.buffers[0].byteLength), source.binary);
  assert.deepEqual(animated.json.nodes.map((node) => node.children), source.json.nodes.map((node) => node.children));
  const clip = animated.json.animations[0];
  assert.equal(clip.name, 'Walk');
  assert.equal(clip.channels.length, 13);
  for (const { target } of clip.channels) assert.equal(animated.json.nodes[target.node].matrix, undefined);
});

// 앱과 같은 Three.js 애니메이션 런타임으로 생성된 결과물을 읽는다.
// 텍스처 바이트는 위에서 검증한다. Node에서 DOM 이미지 디코더를 요구하지 않도록 재질은 제외한다.
const geometryDocument = structuredClone(animated.json);
delete geometryDocument.images;
delete geometryDocument.textures;
delete geometryDocument.materials;
for (const mesh of geometryDocument.meshes) {
  for (const primitive of mesh.primitives) delete primitive.material;
}
const jsonBytes = Buffer.from(JSON.stringify(geometryDocument));
const jsonPadded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
jsonBytes.copy(jsonPadded);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonPadded.length + animated.binary.length, 8);
header.writeUInt32LE(jsonPadded.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(animated.binary.length, 0);
binaryHeader.writeUInt32LE(0x004e4942, 4);
const geometryGlb = Buffer.concat([header, jsonPadded, binaryHeader, animated.binary]);
const { scene, animations } = await new GLTFLoader().parseAsync(
  geometryGlb.buffer.slice(geometryGlb.byteOffset, geometryGlb.byteOffset + geometryGlb.byteLength), '',
);
const clip = animations[0];

test('RBQ-10 walk animates each leg and closes every track without a jump', () => {
  assert.ok(Math.abs(clip.duration - 0.8) < 1e-6);
  for (const track of clip.tracks) {
    const size = track.getValueSize();
    assert.deepEqual(track.values.slice(0, size), track.values.slice(-size), track.name);
    assert.ok(track.values.every(Number.isFinite));
    assert.ok(track.values.some((value, index) => Math.abs(value - track.values[index % size]) > 0.001), track.name);
    if (size === 4) {
      for (let index = 0; index < track.values.length; index += 4) {
        assert.ok(Math.abs(Math.hypot(...track.values.slice(index, index + 4)) - 1) < 1e-6);
        if (track.name.endsWith('_calf.quaternion')) {
          const kneeAngle = 2 * Math.atan2(track.values[index + 1], track.values[index + 3]);
          assert.ok(kneeAngle >= -2.8274 && kneeAngle <= -0.4189, track.name);
        }
      }
    }
  }
  for (const leg of ['RL', 'FL', 'RR', 'FR']) {
    for (const joint of ['hip', 'thigh', 'calf']) {
      assert.ok(clip.tracks.some((track) => track.name === `${leg}_${joint}.quaternion`));
    }
  }
});

test('RBQ-10 trot alternates diagonal pairs with grounded support between keyframes', () => {
  const mixer = new AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const names = ['RL', 'FL', 'RR', 'FR'];
  const calves = names.map((name) => scene.getObjectByName(`${name}_calf_visual`));
  const highest = names.map(() => 0);
  const point = new Vector3();
  // 생성 프레임률의 두 배로 검사해 런타임의 쿼터니언 보간도 검증한다.
  let firstPairLifted = false;
  let secondPairLifted = false;
  for (let sample = 0; sample <= 96; sample += 1) {
    mixer.setTime(sample / 120);
    scene.updateMatrixWorld(true);
    const heights = calves.map((calf, legIndex) => {
      assert.ok(calf?.isMesh);
      const positions = calf.geometry.attributes.position;
      let minimum = Infinity;
      for (let index = 0; index < positions.count; index += 1) {
        point.fromBufferAttribute(positions, index).applyMatrix4(calf.matrixWorld);
        minimum = Math.min(minimum, point.z);
      }
      highest[legIndex] = Math.max(highest[legIndex], minimum);
      assert.ok(minimum > -0.0005, `${names[legIndex]} penetrates the ground at ${sample / 120}s: ${minimum}`);
      return minimum;
    });
    assert.ok(heights.filter((height) => Math.abs(height) < 0.001).length >= 2, `Feet float at ${sample / 120}s: ${heights}`);
    const [rl, fl, rr, fr] = heights;
    assert.ok(Math.abs(fl - rr) < 0.0005, 'Front left and rear right must move together');
    assert.ok(Math.abs(fr - rl) < 0.0005, 'Front right and rear left must move together');
    firstPairLifted ||= fl > 0.025 && fr < 0.001;
    secondPairLifted ||= fr > 0.025 && fl < 0.001;
  }
  assert.ok(firstPairLifted && secondPairLifted, 'Both diagonal pairs must alternate during a cycle');
  for (const height of highest) assert.ok(height > 0.035 && height < 0.045);
  assert.ok(scene.getObjectByName('RBQ10').position.length() < 0.54, 'The walk must stay in the preview frame');
});
