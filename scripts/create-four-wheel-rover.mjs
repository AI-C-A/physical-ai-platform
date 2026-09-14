import { writeFile } from 'node:fs/promises';
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Node에서 GLTFExporter가 사용하는 브라우저의 Blob 읽기 인터페이스를 제공한다.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

const rover = new Group();
rover.name = 'four-wheel-rover';
const body = new MeshStandardMaterial({ color: 0x657364, metalness: 0.45, roughness: 0.55 });
const dark = new MeshStandardMaterial({ color: 0x242a30, roughness: 0.85 });
const metal = new MeshStandardMaterial({ color: 0xb4bdc4, metalness: 0.8, roughness: 0.3 });
const sensor = new MeshStandardMaterial({ color: 0x243e4b, metalness: 0.3, roughness: 0.22 });

function part(name, geometry, material, position) {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  rover.add(mesh);
  return mesh;
}
function box(name, size, material, position) {
  return part(name, new BoxGeometry(...size), material, position);
}
box('chassis', [0.9, 0.24, 1.25], body, [0, 0.38, 0]);
box('cargo-deck', [0.78, 0.06, 0.95], metal, [0, 0.53, 0]);
for (const side of [-1, 1]) {
  for (const end of [-1, 1]) {
    const wheel = part(`wheel-${side}-${end}`, new CylinderGeometry(0.24, 0.24, 0.18, 32), dark, [side * 0.51, 0.24, end * 0.42]);
    wheel.rotation.z = Math.PI / 2;
    const hub = part(`hub-${side}-${end}`, new CylinderGeometry(0.12, 0.12, 0.185, 16), metal, [side * 0.52, 0.24, end * 0.42]);
    hub.rotation.z = Math.PI / 2;
    for (let index = 0; index < 16; index += 1) {
      const angle = index * Math.PI / 8;
      const tread = box(`tread-${side}-${end}-${index}`, [0.19, 0.025, 0.07], dark, [side * 0.51, 0.24 + Math.cos(angle) * 0.24, end * 0.42 + Math.sin(angle) * 0.24]);
      tread.rotation.x = angle;
    }
  }
  box(`bumper-${side}`, [0.94, 0.1, 0.08], dark, [0, 0.32, side * 0.67]);
  box(`headlight-${side}`, [0.16, 0.07, 0.025], metal, [side * 0.29, 0.42, -0.637]);
}
box('sensor-mast', [0.07, 0.3, 0.07], metal, [0, 0.7, -0.32]);
part('lidar', new CylinderGeometry(0.12, 0.12, 0.12, 32), sensor, [0, 0.88, -0.32]);
box('front-camera', [0.22, 0.1, 0.1], dark, [0, 0.6, -0.49]);
const output = await new GLTFExporter().parseAsync(rover, { binary: true });
await writeFile(new URL('../public/assets/four-wheel-rover.glb', import.meta.url), Buffer.from(output));
