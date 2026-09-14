import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { defaultModels, robotModels } from '../model/robot-models';
import type { RobotDescriptor } from '../model/robot';

export function createCarouselScene(host: HTMLElement, robots: readonly RobotDescriptor[], onLoad: (id: string, ok: boolean) => void, onSelect: (index: number) => void, labels: readonly (HTMLElement | null)[] = []) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.dataset.robotSceneInstance = crypto.randomUUID();
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  // 선택한 로봇이 원형 배치의 앞에 오도록 낮은 망원 시점을 사용한다.
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  let cameraDistance = 12;
  const studioColor = new THREE.Color(0x151619);
  scene.background = studioColor;
  scene.fog = new THREE.Fog(studioColor, 16, 34);
  camera.position.set(0, 2.8, cameraDistance);
  camera.lookAt(0, 1.1, 0);
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = generator.fromScene(room);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.55;
  room.dispose();
  generator.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x22242a, 0.45));
  const light = new THREE.SpotLight(0xffffff, 95, 22, Math.PI / 5, 0.8, 2);
  light.position.set(-3, 6, 5);
  light.target.position.set(0, 0.8, 0);
  scene.add(light.target);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.normalBias = 0.025;
  light.shadow.radius = 4;
  light.shadow.bias = -0.001;
  scene.add(light);
  const rim = new THREE.DirectionalLight(0xdbe6ff, 1.2);
  rim.position.set(3, 4, -4);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({
    color: 0x050608, roughness: 0.8, metalness: 0, envMapIntensity: 0.02,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  floor.receiveShadow = true;
  scene.add(floor);
  const slots = robots.map(() => {
    const slot = new THREE.Group();
    scene.add(slot);
    return slot;
  });
  const modelYaw = robots.map(() => 0);
  const modelSizes = robots.map(() => new THREE.Vector3(1, 2, 1));
  const surfaceColors: { material: THREE.MeshStandardMaterial; color: THREE.Color }[][] = robots.map(() => []);
  const loader = new GLTFLoader();
  let disposed = false;
  function disposeObject(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value: unknown) => { if (value instanceof THREE.Texture) value.dispose(); });
        material.dispose();
      });
    });
  }
  robots.forEach((robot, index) => {
    const modelId = robot.modelId ?? (robot.robotType ? defaultModels[robot.robotType] : undefined);
    if (!modelId) { onLoad(robot.id, false); return; }
    const model = robotModels[modelId];
    void loader.loadAsync(`${import.meta.env.BASE_URL}assets/${model.file}`).then((gltf) => {
      if (disposed) { disposeObject(gltf.scene); return; }
      const root = gltf.scene;
      if (modelId === 'rbq10') root.rotation.x = -Math.PI / 2;
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root);
      const center = bounds.getCenter(new THREE.Vector3());
      // 미터 단위 자산에 공통 배율을 적용해 실제 크기 비율을 유지한다.
      const scale = 2;
      modelSizes[index] = bounds.getSize(new THREE.Vector3()).multiplyScalar(scale);
      root.scale.multiplyScalar(scale);
      root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => {
            if (material instanceof THREE.MeshStandardMaterial && !surfaceColors[index]?.some((entry) => entry.material === material)) {
              surfaceColors[index]?.push({ material, color: material.color.clone() });
            }
          });
        }
      });
      const pivot = new THREE.Group();
      // 모델별로 정의된 전면 사선 시점을 유지한다.
      const azimuth = Number.parseFloat(model.orbit.split(' ')[0] ?? '0');
      pivot.rotation.y = modelId === 'four-wheel-rover'
        ? -Math.PI / 4
        : -THREE.MathUtils.degToRad(azimuth);
      modelYaw[index] = pivot.rotation.y;
      pivot.add(root);
      slots[index]?.add(pivot);
      onLoad(robot.id, true);
    }).catch(() => { if (!disposed) onLoad(robot.id, false); });
  });
  let immersive = true;
  let presentation = 1;
  let presentationFrom = 1;
  let presentationProgress = () => 1;
  let selectedIndex = 0;
  let previewYaw = 0;
  let initialized = false;
  let current = 0;
  let target = 0;
  const step = Math.PI * 2 / Math.max(robots.length, 1);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // 뷰포트 이동 중에도 그리기 버퍼 크기를 유지한다.
  Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
  function resizeBuffer() {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  resizeBuffer();
  window.addEventListener('resize', resizeBuffer);
  let frame = 0;
  let last = performance.now();
  function render(now: number) {
    const rect = host.getBoundingClientRect();
    camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    cameraDistance = Math.max(12, 6 / camera.aspect);
    camera.updateProjectionMatrix();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    current += (target - current) * (motion.matches ? 1 : 1 - Math.exp(-dt * 9));
    const blend = motion.matches ? 1 : 1 - Math.exp(-dt * 7);
    const easedTravel = motion.matches ? 1 : presentationProgress();
    presentation = THREE.MathUtils.lerp(presentationFrom, immersive ? 1 : 0, easedTravel);
    if (immersive) previewYaw *= 1 - blend;
    scene.background = null;
    renderer.setClearColor(studioColor, presentation);
    floor.visible = presentation > 0.02;
    floor.material.transparent = true;
    floor.material.opacity = presentation;
    const size = modelSizes[selectedIndex] ?? new THREE.Vector3(1, 2, 1);
    const focusY = size.y / 2;
    // 모델 깊이와 회전을 포함한 경계 상자의 여덟 꼭짓점을 화면 안에 맞춘다.
    const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
    const viewDirection = new THREE.Vector3(0, 0.14, 1).normalize();
    const viewUp = new THREE.Vector3(0, viewDirection.z, -viewDirection.y);
    const yaw = (modelYaw[selectedIndex] ?? 0) + previewYaw;
    let previewDistance = 0;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2)
        .applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      const depth = corner.dot(viewDirection);
      previewDistance = Math.max(previewDistance,
        depth + Math.abs(corner.x) / Math.tan(horizontalHalfFov),
        depth + Math.abs(corner.dot(viewUp)) / Math.tan(verticalHalfFov));
    }
    camera.position.set(0, THREE.MathUtils.lerp(focusY + previewDistance * viewDirection.y, 2.8, presentation), THREE.MathUtils.lerp(previewDistance * viewDirection.z, cameraDistance, presentation));
    camera.lookAt(0, THREE.MathUtils.lerp(focusY, 1.1, presentation), 0);
    slots.forEach((slot, index) => {
      const angle = index * step - current;
      slot.position.set(Math.sin(angle) * 5.8, 0, (Math.cos(angle) - 1) * 5.8);
      // 원형 배치에서 이동할 때 모델 크기는 유지한다.
      slot.rotation.y = previewYaw;
      slot.visible = index === selectedIndex || presentation > 0.6;
      const emphasis = (0.16 + 0.84 * Math.pow(Math.max(0, Math.cos(angle)), 4)) * (index === selectedIndex ? 1 : Math.max(0, (presentation - 0.6) / 0.4));
      surfaceColors[index]?.forEach(({ material, color }) => { material.color.copy(color).multiplyScalar(emphasis); });
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();
    renderer.setViewport(rect.left, window.innerHeight - rect.bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, window.innerHeight - rect.bottom, rect.width, rect.height);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
    slots.forEach((slot, index) => {
      const label = labels[index];
      if (!label) return;
      const anchor = new THREE.Vector3(0, (modelSizes[index]?.y ?? 2) + 0.25, 0);
      slot.localToWorld(anchor).project(camera);
      const x = (anchor.x + 1) * rect.width / 2;
      const y = (1 - anchor.y) * rect.height / 2;
      label.hidden = !immersive || presentation < 0.98 || slot.children.length === 0
        || anchor.z < -1 || anchor.z > 1 || x < 0 || x > rect.width || y < 0 || y > rect.height;
      label.style.left = `${Math.max(label.offsetWidth / 2 + 8, Math.min(rect.width - label.offsetWidth / 2 - 8, x))}px`;
      label.style.top = `${Math.max(label.offsetHeight + 96, y)}px`;
    });
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  const raycaster = new THREE.Raycaster();
  function pick(event: PointerEvent) {
    const rect = host.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const hit = raycaster.intersectObjects(slots, true)[0];
    if (!hit) return;
    let object = hit.object;
    while (object.parent && !slots.includes(object as THREE.Group)) object = object.parent;
    const index = slots.indexOf(object as THREE.Group);
    if (index >= 0) onSelect(index);
  }
  return {
    present(expanded: boolean, immediate = false, progress = () => 1) {
      if (expanded !== immersive || immediate) {
        presentationFrom = presentation;
        presentationProgress = progress;
        immersive = expanded;
        if (immediate) presentationFrom = presentation = expanded ? 1 : 0;
      }
    },
    orbit(delta: number) { previewYaw += delta; },
    select(index: number) {
      const changed = selectedIndex !== index;
      selectedIndex = index;
      const angle = index * step;
      const delta = Math.atan2(Math.sin(angle - target), Math.cos(angle - target));
      target += delta;
      if (!initialized || (!immersive && changed)) { current = target; initialized = true; }
    },
    pick,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resizeBuffer);
      disposeObject(scene);
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
