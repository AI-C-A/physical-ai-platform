import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Badge } from '@/shared/ui/badge';
import { MediaPanel } from '@/shared/ui/media-panel';
import { readCollectionVisualPalette } from './collection-visual-palette';

import type {
  CollectionHandJointPose,
  CollectionHandPoseTelemetry,
  CollectionStreamTelemetry,
} from '../model/flywheel';
import {
  QUEST_HAND_BONES,
  QUEST_HAND_JOINT_NAMES,
  transformHandJoint,
} from './quest-hand-pose-geometry';

type Handedness = 'left' | 'right';

interface QuestHandPoseViewerProps {
  readonly className?: string;
  readonly handPose?: CollectionHandPoseTelemetry | null;
  readonly streams?: readonly CollectionStreamTelemetry[];
  readonly streamState?: 'idle' | 'live' | 'recorded';
}

const fallbackRadiusMeters = 0.006;

function handStream(
  streams: readonly CollectionStreamTelemetry[],
  handedness: Handedness,
): CollectionStreamTelemetry | null {
  return streams.find((stream) => stream.streamId === `quest-hand-${handedness}`) ?? null;
}

function handStateLabel(
  pose: CollectionHandPoseTelemetry | null,
  handedness: Handedness,
  stream: CollectionStreamTelemetry | null,
): string {
  const observation = pose?.hands[handedness];
  if (observation?.poseObserved === true) return '추적';
  if (observation?.sourcePresent === false || stream?.connectionState === 'offline') return '유실';
  return stream?.handTracking?.qualityState === 'tracking'
    ? '추적'
    : stream?.handTracking?.qualityState === 'lost' ? '유실' : '부분';
}

function stateTone(label: string): 'positive' | 'warning' | 'negative' {
  if (label === '추적') return 'positive';
  if (label === '부분') return 'warning';
  return 'negative';
}

function jointKey(handedness: Handedness, name: string): string {
  return `${handedness}:${name}`;
}

export function QuestHandPoseViewer({
  className,
  handPose = null,
  streams = [],
  streamState = 'idle',
}: QuestHandPoseViewerProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const updateSceneRef = useRef<(fitCamera: boolean) => void>(() => undefined);
  const [webGlUnavailable, setWebGlUnavailable] = useState(false);
  const hasObservedJoints = (['left', 'right'] as const).some((handedness) => (
    handPose?.hands[handedness].poseObserved === true && handPose.hands[handedness].joints.length > 0
  ));
  const poseRef = useRef(handPose);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (host === null) return undefined;
    if (typeof globalThis.WebGLRenderingContext === 'undefined') {
      void Promise.resolve().then(() => setWebGlUnavailable(true));
      return undefined;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      void Promise.resolve().then(() => setWebGlUnavailable(true));
      return undefined;
    }
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    renderer.domElement.className = 'block size-full touch-none';
    renderer.domElement.setAttribute('aria-label', 'Quest 양손 3D 관절 캔버스');
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 10);
    camera.position.set(0.28, 0.18, 0.36);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 0.08;
    controls.maxDistance = 2;
    const palette = readCollectionVisualPalette(host);
    const light = new THREE.HemisphereLight(palette.light, palette.groundLight, 2.2);
    scene.add(light);
    const grid = new THREE.GridHelper(0.6, 12, palette.gridMajor, palette.gridMinor);
    grid.position.y = -0.12;
    scene.add(grid);

    const sphereGeometry = new THREE.SphereGeometry(1, 18, 12);
    const boneGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
    const jointMeshes = new Map<string, THREE.Mesh>();
    const boneMeshes = new Map<string, THREE.Mesh>();
    const materials = (['left', 'right'] as const).reduce<Record<Handedness, THREE.MeshStandardMaterial>>(
      (result, handedness) => ({
        ...result,
        [handedness]: new THREE.MeshStandardMaterial({
          color: palette[handedness],
          emissive: palette[handedness],
          emissiveIntensity: 0.18,
          metalness: 0.08,
          roughness: 0.42,
        }),
      }),
      {} as Record<Handedness, THREE.MeshStandardMaterial>,
    );
    (['left', 'right'] as const).forEach((handedness) => {
      QUEST_HAND_JOINT_NAMES.forEach((name) => {
        const mesh = new THREE.Mesh(sphereGeometry, materials[handedness]);
        mesh.visible = false;
        scene.add(mesh);
        jointMeshes.set(jointKey(handedness, name), mesh);
      });
      QUEST_HAND_BONES.forEach(([from, to]) => {
        const mesh = new THREE.Mesh(boneGeometry, materials[handedness]);
        mesh.visible = false;
        scene.add(mesh);
        boneMeshes.set(`${handedness}:${from}:${to}`, mesh);
      });
    });

    const allPoints: THREE.Vector3[] = [];
    const center = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let hadPoints = false;
    const render = () => renderer.render(scene, camera);
    const updateScene = (fitCamera: boolean) => {
      const currentPose = poseRef.current;
      allPoints.length = 0;
      jointMeshes.forEach((mesh) => { mesh.visible = false; });
      boneMeshes.forEach((mesh) => { mesh.visible = false; });
      (['left', 'right'] as const).forEach((handedness) => {
        const observation = currentPose?.hands[handedness];
        const joints = observation?.poseObserved === true
          ? new Map(observation.joints.map((joint) => [joint.name, joint]))
          : new Map<string, CollectionHandJointPose>();
        const wrist = joints.get('wrist');
        observation?.joints.forEach((joint) => {
          const mesh = jointMeshes.get(jointKey(handedness, joint.name));
          if (mesh === undefined || wrist === undefined || !observation.poseObserved) return;
          const point = new THREE.Vector3(...transformHandJoint(joint, wrist, handedness, 'world'));
          mesh.position.copy(point);
          const radius = joint.radiusMeters ?? fallbackRadiusMeters;
          mesh.scale.setScalar(Math.max(0.0025, radius));
          mesh.visible = true;
          allPoints.push(point);
        });
        QUEST_HAND_BONES.forEach(([fromName, toName]) => {
          const mesh = boneMeshes.get(`${handedness}:${fromName}:${toName}`);
          const from = joints.get(fromName);
          const to = joints.get(toName);
          if (mesh === undefined) return;
          if (from === undefined || to === undefined || wrist === undefined) {
            mesh.visible = false;
            return;
          }
          const fromPoint = new THREE.Vector3(...transformHandJoint(from, wrist, handedness, 'world'));
          const toPoint = new THREE.Vector3(...transformHandJoint(to, wrist, handedness, 'world'));
          const delta = toPoint.clone().sub(fromPoint);
          const length = delta.length();
          mesh.position.copy(fromPoint).addScaledVector(delta, 0.5);
          mesh.quaternion.setFromUnitVectors(up, delta.normalize());
          const radius = Math.max(0.0018, Math.min(from.radiusMeters ?? fallbackRadiusMeters, to.radiusMeters ?? fallbackRadiusMeters) * 0.42);
          mesh.scale.set(radius, length, radius);
          mesh.visible = length > 0;
        });
      });
      if (allPoints.length > 0) {
        center.set(0, 0, 0);
        allPoints.forEach((point) => center.add(point));
        center.multiplyScalar(1 / allPoints.length);
        [...jointMeshes.values(), ...boneMeshes.values()].forEach((mesh) => {
          if (mesh.visible) mesh.position.sub(center);
        });
      }
      if (fitCamera || (!hadPoints && allPoints.length > 0)) {
        const box = new THREE.Box3().setFromPoints(allPoints.map((point) => point.clone().sub(center)));
        const size = box.isEmpty() ? 0.28 : Math.max(box.getSize(new THREE.Vector3()).length(), 0.12);
        controls.target.set(0, 0, 0);
        camera.position.set(size * 1.3, size * 0.8, size * 1.8);
        controls.update();
      }
      hadPoints = allPoints.length > 0;
      render();
    };

    updateSceneRef.current = updateScene;
    updateScene(true);
    controls.addEventListener('change', render);
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    return () => {
      updateSceneRef.current = () => undefined;
      controls.removeEventListener('change', render);
      controls.dispose();
      observer.disconnect();
      sphereGeometry.dispose();
      boneGeometry.dispose();
      Object.values(materials).forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    poseRef.current = handPose;
    updateSceneRef.current(false);
  }, [handPose]);

  const leftStream = handStream(streams, 'left');
  const rightStream = handStream(streams, 'right');
  const leftState = handStateLabel(handPose, 'left', leftStream);
  const rightState = handStateLabel(handPose, 'right', rightStream);

  return (
    <MediaPanel
      aria-label="Quest 손 포즈 3D"
      className={className}
      data-hand-pose-viewer
      data-stream-state={streamState}
      title="손 추적"
      status={(
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stateTone(leftState)}>L {leftState}</Badge>
          <Badge tone={stateTone(rightState)}>R {rightState}</Badge>
        </div>
      )}
    >

      <div className="relative min-h-0">
        <div className="absolute inset-0" ref={canvasHostRef} />
        {!hasObservedJoints ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-2 text-center">
            <p className="text-xs font-semibold">손 프레임 대기</p>
          </div>
        ) : null}
        {webGlUnavailable ? (
          <p className="absolute inset-x-3 bottom-3 rounded-[var(--design-radius-control)] bg-layer-raised p-2 text-xs text-muted" role="status">
            3D 화면을 표시할 수 없습니다. 브라우저의 그래픽 가속 설정을 확인하세요.
          </p>
        ) : null}
      </div>
    </MediaPanel>
  );
}
