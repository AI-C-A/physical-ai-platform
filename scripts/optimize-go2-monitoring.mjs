import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 도구 설치: npm install --prefix artifacts/tools/gltf-transform --no-save --no-package-lock @gltf-transform/cli@4.5.0 meshoptimizer@1.2.0 draco3dgltf@1.5.7
// 실행: node scripts/optimize-go2-monitoring.mjs artifacts/tools/gltf-transform/node_modules
const dependencyRoot = process.argv[2];
if (!dependencyRoot) throw new Error('glTF Transform 도구의 node_modules 경로가 필요합니다.');
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(workspace, 'public/assets/go2_walk.glb');
const outputPath = resolve(workspace, 'public/assets/go2_walk-monitoring.glb');
const reportPath = resolve(workspace, 'artifacts/design-qa/go2-monitoring-optimization.json');
const settings = { ratio: 0.15, error: 0.005, maximumTriangles: 120_000 };
const load = (path) => import(pathToFileURL(resolve(dependencyRoot, path)).href);
const packageVersion = async (name) => JSON.parse(await readFile(
  resolve(dependencyRoot, name, 'package.json'), 'utf8',
)).version;
assert.equal(await packageVersion('@gltf-transform/core'), '4.5.0');
assert.equal(await packageVersion('meshoptimizer'), '1.2.0');
assert.equal(await packageVersion('draco3dgltf'), '1.5.7');

const { NodeIO } = await load('@gltf-transform/core/dist/index.js');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions/dist/index.js');
const { simplify, draco, getBounds } = await load('@gltf-transform/functions/dist/index.js');
const { MeshoptSimplifier } = await load('meshoptimizer/meshopt_simplifier.js');
const { default: draco3d } = await load('draco3dgltf/draco3dgltf.js');
const { default: validator } = await load('gltf-validator/index.js');
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function preserveNodeTransforms(encodedBytes, sourceBytes) {
  const encoded = Buffer.from(encodedBytes);
  const source = Buffer.from(sourceBytes);
  const readJson = (bytes) => JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const json = readJson(encoded);
  const sourceJson = readJson(source);
  assert.equal(json.nodes.length, sourceJson.nodes.length);
  // NodeIO의 기본값 생략 허용오차가 작은 관절 이동값을 지우지 않도록 원본 TRS를 보존한다.
  json.nodes.forEach((node, index) => {
    assert.equal(node.name, sourceJson.nodes[index].name);
    for (const property of ['matrix', 'translation', 'rotation', 'scale']) {
      delete node[property];
      if (Object.hasOwn(sourceJson.nodes[index], property)) {
        node[property] = sourceJson.nodes[index][property];
      }
    }
  });
  const serialized = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(serialized.length / 4) * 4, 0x20);
  serialized.copy(padded);
  const binaryChunk = encoded.subarray(20 + encoded.readUInt32LE(12));
  const header = Buffer.from(encoded.subarray(0, 20));
  header.writeUInt32LE(header.length + padded.length + binaryChunk.length, 8);
  header.writeUInt32LE(padded.length, 12);
  return Buffer.concat([header, padded, binaryChunk]);
}

function accessorSnapshot(accessor) {
  if (accessor === null) return null;
  const array = accessor.getArray();
  assert.notEqual(array, null);
  return {
    type: accessor.getType(),
    componentType: accessor.getComponentType(),
    count: accessor.getCount(),
    normalized: accessor.getNormalized(),
    sha256: hash(Buffer.from(array.buffer, array.byteOffset, array.byteLength)),
  };
}

function animationAndRigSnapshot(document) {
  const root = document.getRoot();
  const nodes = root.listNodes();
  const meshes = root.listMeshes();
  const skins = root.listSkins();
  return {
    scenes: root.listScenes().map((scene) => ({
      name: scene.getName(), children: scene.listChildren().map((node) => nodes.indexOf(node)),
    })),
    nodes: nodes.map((node) => ({
      name: node.getName(),
      children: node.listChildren().map((child) => nodes.indexOf(child)),
      matrix: node.getMatrix(),
      mesh: meshes.indexOf(node.getMesh()),
      skin: skins.indexOf(node.getSkin()),
      weights: node.getWeights(),
    })),
    meshes: meshes.map((mesh) => ({
      name: mesh.getName(), weights: mesh.getWeights(),
      primitives: mesh.listPrimitives().map((primitive) => ({
        mode: primitive.getMode(),
        material: root.listMaterials().indexOf(primitive.getMaterial()),
        semantics: primitive.listSemantics(),
        morphTargets: primitive.listTargets().length,
      })),
    })),
    skins: skins.map((skin) => ({
      name: skin.getName(),
      skeleton: nodes.indexOf(skin.getSkeleton()),
      joints: skin.listJoints().map((joint) => nodes.indexOf(joint)),
      inverseBindMatrices: accessorSnapshot(skin.getInverseBindMatrices()),
    })),
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(),
      channels: animation.listChannels().map((channel) => {
        const sampler = channel.getSampler();
        assert.notEqual(sampler, null);
        return {
          node: nodes.indexOf(channel.getTargetNode()),
          path: channel.getTargetPath(),
          interpolation: sampler.getInterpolation(),
          input: accessorSnapshot(sampler.getInput()),
          output: accessorSnapshot(sampler.getOutput()),
        };
      }),
    })),
    materials: root.listMaterials().map((material) => ({
      name: material.getName(), baseColor: material.getBaseColorFactor(),
      emissive: material.getEmissiveFactor(), metallic: material.getMetallicFactor(),
      roughness: material.getRoughnessFactor(), alphaMode: material.getAlphaMode(),
      doubleSided: material.getDoubleSided(),
    })),
    textures: root.listTextures().map((texture) => ({
      name: texture.getName(), mimeType: texture.getMimeType(),
      image: texture.getImage() === null ? null : hash(texture.getImage()),
    })),
  };
}

function geometryStats(document) {
  const root = document.getRoot();
  let triangles = 0;
  let vertices = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      assert.equal(primitive.getMode(), 4, '관제 파생 모델은 삼각형 메시만 처리합니다.');
      const positions = primitive.getAttribute('POSITION');
      assert.notEqual(positions, null);
      vertices += positions.getCount();
      triangles += (primitive.getIndices()?.getCount() ?? positions.getCount()) / 3;
    }
  }
  return { triangles, vertices, meshes: root.listMeshes().length, nodes: root.listNodes().length,
    skins: root.listSkins().length, animations: root.listAnimations().length,
    bounds: root.listScenes().map((scene) => getBounds(scene)) };
}

const sourceBytes = await readFile(sourcePath);
const original = await io.readBinary(sourceBytes);
const before = geometryStats(original);
const rig = animationAndRigSnapshot(original);
const primitiveErrors = [];
let spatialFallbackCount = 0;

await original.transform(
  simplify({
    simplifier: {
      ...MeshoptSimplifier,
      // 원본의 분리된 법선 정점을 허용하되 메시 크기 대비 0.5% 오차 한도를 지킨다.
      simplify: (indices, positions, stride, targetCount, error, flags) => {
        let result = MeshoptSimplifier.simplify(
          indices, positions, stride, Math.max(3, targetCount), error,
          [...flags, 'Permissive'],
        );
        if (result[0].length > targetCount * 1.5) {
          // 분리된 몸통 표면은 같은 오차 한도에서만 공간 단순화를 허용한다.
          const spatial = MeshoptSimplifier.simplifySloppy(
            indices, positions, stride, null, Math.max(3, targetCount), error,
          );
          if (spatial[0].length > 0 && spatial[0].length < result[0].length && spatial[1] <= error) {
            result = spatial;
            spatialFallbackCount += 1;
          }
        }
        primitiveErrors.push(result[1]);
        return result;
      },
    },
    ratio: settings.ratio,
    error: settings.error,
  }),
  draco({ quantizePosition: 16, quantizeNormal: 14, quantizeTexcoord: 14 }),
);
assert.deepEqual(animationAndRigSnapshot(original), rig, '메시 최적화가 관절·애니메이션·재질을 변경했습니다.');

const outputBytes = preserveNodeTransforms(await io.writeBinary(original), sourceBytes);
const output = await io.readBinary(outputBytes);
assert.deepEqual(animationAndRigSnapshot(output), rig, 'GLB 재인코딩이 관절·애니메이션·재질을 변경했습니다.');
const after = geometryStats(output);
assert(after.triangles <= settings.maximumTriangles,
  `오차 한도 내 목표 삼각형 수를 달성하지 못했습니다: ${String(after.triangles)}`);
const maximumReportedError = Math.max(...primitiveErrors);
assert(maximumReportedError <= settings.error + Number.EPSILON);
const boundsDifferences = before.bounds.map((bounds, index) => {
  const diagonal = Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis]));
  const maxDelta = Math.max(...['min', 'max'].flatMap((edge) => bounds[edge].map(
    (value, axis) => Math.abs(value - after.bounds[index][edge][axis]),
  )));
  assert(maxDelta / diagonal <= 0.002, '최적화 이후 외형 범위가 허용치를 벗어났습니다.');
  return { maximumAbsoluteDelta: maxDelta, relativeToSceneDiagonal: maxDelta / diagonal };
});
const validation = await validator.validateBytes(outputBytes, { uri: 'go2_walk-monitoring.glb' });
assert.equal(validation.issues.numErrors, 0, JSON.stringify(validation.issues));
assert.equal(hash(await readFile(sourcePath)), hash(sourceBytes), '원본 모델이 변경됐습니다.');
assert(outputBytes.byteLength < sourceBytes.byteLength, '파생 모델이 원본보다 큽니다.');

const report = {
  source: 'public/assets/go2_walk.glb', output: 'public/assets/go2_walk-monitoring.glb',
  settings, tools: { gltfTransform: await packageVersion('@gltf-transform/core'),
    meshoptimizer: await packageVersion('meshoptimizer'), draco: await packageVersion('draco3dgltf') },
  before: { ...before, bytes: sourceBytes.byteLength, sha256: hash(sourceBytes) },
  after: { ...after, bytes: outputBytes.byteLength, sha256: hash(outputBytes) },
  maximumReportedError, spatialFallbackCount, boundsDifferences,
  animationAndRigPreserved: true, validation: validation.issues,
};
await writeFile(outputPath, outputBytes);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  source: report.source, output: report.output, settings,
  before: report.before, after: report.after, maximumReportedError,
  spatialFallbackCount, boundsDifferences, animationAndRigPreserved: true,
  validation: { errors: validation.issues.numErrors, warnings: validation.issues.numWarnings,
    infos: validation.issues.numInfos },
}, null, 2));
