import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 첫 인자는 @gltf-transform/cli 4.5.0을 설치한 node_modules 경로다.
const dependencyRoot = process.argv[2];
if (!dependencyRoot) throw new Error('glTF Transform 도구의 node_modules 경로가 필요합니다.');
const load = (path) => import(pathToFileURL(resolve(dependencyRoot, path)).href);
const { NodeIO } = await load('@gltf-transform/core/dist/index.js');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions/dist/index.js');
const { simplify, quantize, prune } = await load('@gltf-transform/functions/dist/index.js');
const { MeshoptSimplifier } = await load('meshoptimizer/meshopt_simplifier.js');
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read('public/assets/unitree-g1.glb');
await document.transform(
  simplify({
    simplifier: {
      ...MeshoptSimplifier,
      // STL 면마다 나뉜 정점도 단순화하되 외형 오차는 메시 반경의 0.05%로 제한한다.
      simplify: (indices, positions, stride, targetCount, error, flags) => MeshoptSimplifier.simplify(
        indices, positions, stride, targetCount, error, [...flags, 'Permissive'],
      ),
    },
    ratio: 0.15,
    error: 0.0005,
  }),
  quantize(),
  prune(),
);
await io.write('artifacts/design-qa/unitree-g1-optimized.glb', document);
