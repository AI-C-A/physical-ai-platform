import { readFileSync, writeFileSync } from 'node:fs';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BINARY_CHUNK_TYPE = 0x004e4942;
const FLOAT_COMPONENT_TYPE = 5126;
const UNSIGNED_SHORT_COMPONENT_TYPE = 5123;

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

const cubePositions = [
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
  -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
  0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
  -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
];

const cubeNormals = [
  0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
  0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
  1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
];

const cubeIndices = [
  0, 1, 2, 0, 2, 3,
  4, 5, 6, 4, 6, 7,
  8, 9, 10, 8, 10, 11,
  12, 13, 14, 12, 14, 15,
  16, 17, 18, 16, 18, 19,
  20, 21, 22, 20, 22, 23,
];

const fingers = [
  { length: 0.047, name: 'index', x: -0.029 },
  { length: 0.052, name: 'middle', x: -0.01 },
  { length: 0.049, name: 'ring', x: 0.01 },
  { length: 0.043, name: 'little', x: 0.029 },
];

const [inputPath, outputPath] = process.argv.slice(2);
if (inputPath === undefined || outputPath === undefined) {
  throw new Error('Usage: node scripts/create-openarm-five-finger.mjs <input.glb> <output.glb>');
}

const { binary: sourceBinary, json } = readGlb(inputPath);
if (json.asset?.extras?.openArmHandVariant !== undefined) {
  throw new Error('Input model already declares an OpenArm hand variant.');
}

json.bufferViews ??= [];
json.accessors ??= [];
json.meshes ??= [];
json.materials ??= [];
json.nodes ??= [];

const sourceLength = json.buffers[0].byteLength;
let binary = Buffer.alloc(alignToFour(sourceLength));
sourceBinary.copy(binary, 0, 0, sourceLength);

function appendData(values, componentType) {
  const offset = alignToFour(binary.length);
  const bytesPerElement = componentType === FLOAT_COMPONENT_TYPE ? 4 : 2;
  const data = Buffer.alloc(values.length * bytesPerElement);
  values.forEach((value, index) => {
    if (componentType === FLOAT_COMPONENT_TYPE) data.writeFloatLE(value, index * bytesPerElement);
    else data.writeUInt16LE(value, index * bytesPerElement);
  });
  if (offset !== binary.length) binary = Buffer.concat([binary, Buffer.alloc(offset - binary.length)]);
  binary = Buffer.concat([binary, data]);
  return { byteLength: data.length, byteOffset: offset };
}

function addAccessor(values, componentType, type, bounds = {}) {
  const appended = appendData(values, componentType);
  const bufferView = json.bufferViews.push({
    buffer: 0,
    byteLength: appended.byteLength,
    byteOffset: appended.byteOffset,
    ...(type === 'SCALAR' ? { target: 34963 } : { target: 34962 }),
  }) - 1;
  const componentCount = type === 'SCALAR' ? 1 : 3;
  return json.accessors.push({
    bufferView,
    componentType,
    count: values.length / componentCount,
    type,
    ...bounds,
  }) - 1;
}

const positionAccessor = addAccessor(
  cubePositions,
  FLOAT_COMPONENT_TYPE,
  'VEC3',
  { max: [0.5, 0.5, 0.5], min: [-0.5, -0.5, -0.5] },
);
const normalAccessor = addAccessor(cubeNormals, FLOAT_COMPONENT_TYPE, 'VEC3');
const indexAccessor = addAccessor(cubeIndices, UNSIGNED_SHORT_COMPONENT_TYPE, 'SCALAR');

const handMaterial = json.materials.push({
  name: 'Five-digit visualization material',
  pbrMetallicRoughness: {
    baseColorFactor: [0.18, 0.22, 0.28, 1],
    metallicFactor: 0.35,
    roughnessFactor: 0.42,
  },
}) - 1;
const handMesh = json.meshes.push({
  name: 'Five-digit hand segment',
  primitives: [{
    attributes: { NORMAL: normalAccessor, POSITION: positionAccessor },
    indices: indexAccessor,
    material: handMaterial,
  }],
}) - 1;

function addVisualNode(handNode, node) {
  const nodeIndex = json.nodes.push({ mesh: handMesh, ...node }) - 1;
  handNode.children.push(nodeIndex);
}

function addFiveDigitHand(side) {
  const handName = `openarm_${side}_hand`;
  const handIndex = json.nodes.findIndex((node) => node.name === handName);
  if (handIndex < 0) throw new Error(`Missing OpenArm hand node: ${handName}`);

  const handNode = json.nodes[handIndex];
  handNode.children ??= [];
  const removedFingerNames = new Set([
    `openarm_${side}_right_finger`,
    `openarm_${side}_left_finger`,
  ]);
  handNode.children = handNode.children.filter((childIndex) => (
    !removedFingerNames.has(json.nodes[childIndex]?.name)
  ));

  addVisualNode(handNode, {
    name: `openarm_${side}_five_digit_palm`,
    scale: [0.082, 0.034, 0.07],
    translation: [0, 0.002, 0.045],
  });

  for (const finger of fingers) {
    const distalLength = finger.length * 0.72;
    const bend = finger.name === 'little' ? -0.13 : finger.name === 'index' ? 0.08 : 0;
    addVisualNode(handNode, {
      name: `openarm_${side}_${finger.name}_proximal`,
      rotation: axisAngleQuaternion([0, 1, 0], bend),
      scale: [0.014, 0.025, finger.length],
      translation: [finger.x, 0.002, 0.08 + finger.length / 2],
    });
    addVisualNode(handNode, {
      name: `openarm_${side}_${finger.name}_distal`,
      rotation: axisAngleQuaternion([1, 0, 0], -0.18),
      scale: [0.013, 0.023, distalLength],
      translation: [finger.x, 0.006, 0.08 + finger.length + distalLength / 2],
    });
  }

  const thumbDirection = side === 'left' ? -1 : 1;
  const thumbAngle = thumbDirection * 0.88;
  const thumbLength = 0.044;
  const thumbDistalLength = 0.032;
  const thumbVector = [Math.sin(thumbAngle), 0, Math.cos(thumbAngle)];
  const thumbBase = [thumbDirection * 0.038, -0.001, 0.052];
  addVisualNode(handNode, {
    name: `openarm_${side}_thumb_proximal`,
    rotation: axisAngleQuaternion([0, 1, 0], thumbAngle),
    scale: [0.016, 0.027, thumbLength],
    translation: thumbBase.map((value, index) => value + thumbVector[index] * thumbLength / 2),
  });
  addVisualNode(handNode, {
    name: `openarm_${side}_thumb_distal`,
    rotation: axisAngleQuaternion([0, 1, 0], thumbAngle + thumbDirection * 0.16),
    scale: [0.014, 0.024, thumbDistalLength],
    translation: thumbBase.map((value, index) => (
      value + thumbVector[index] * (thumbLength + thumbDistalLength / 2)
    )),
  });
}

addFiveDigitHand('left');
addFiveDigitHand('right');

json.asset.extras = {
  ...(json.asset.extras ?? {}),
  openArmHandVariant: 'five-digit-visualization',
};
json.buffers[0].byteLength = binary.length;
writeGlb(outputPath, json, binary);
console.log('Created five-digit OpenArm visualization: 2 palms, 20 finger segments.');
