import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { CollectionHandPoseTelemetry } from '../model/flywheel';
import { normalizedQuaternion, QUEST_HAND_JOINT_NAMES } from './quest-hand-pose-geometry';

/** WebXR 손 모델은 기준 좌표계에서 같은 부모를 갖는 관절 25개를 사용한다. */
export class QuestSmoothHand {
  readonly root = new THREE.Group();
  private readonly bones = new Map<string, THREE.Object3D>();

  private readonly model: THREE.Group;

  constructor(model: THREE.Group, color: THREE.ColorRepresentation) {
    this.model = model;
    for (const name of QUEST_HAND_JOINT_NAMES) {
      const bone = model.getObjectByName(name);
      if (!bone) throw new Error(`Missing hand joint: ${name}`);
      this.bones.set(name, bone);
    }
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
      const previous = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      previous.forEach((material) => material.dispose());
      object.material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
      // 추적 중 정점이 초기 자세의 경계를 벗어나므로 고정 경계로 숨기지 않는다.
      object.frustumCulled = false;
    });
    this.root.add(model);
    this.root.visible = false;
  }

  update(pose: CollectionHandPoseTelemetry | null, side: 'left' | 'right', center: THREE.Vector3) {
    const hand = pose?.hands[side];
    this.root.visible = hand?.poseObserved === true
      && QUEST_HAND_JOINT_NAMES.every((name) => hand.joints.some((joint) => joint.name === name));
    if (!this.root.visible || !hand) return;
    for (const joint of hand.joints) {
      const bone = this.bones.get(joint.name);
      if (!bone) continue;
      bone.position.fromArray(joint.positionMeters);
      bone.quaternion.copy(normalizedQuaternion(joint.orientationQuaternion));
    }
    if (pose?.viewerPose) {
      this.root.quaternion.copy(normalizedQuaternion(pose.viewerPose.orientationQuaternion).invert());
      this.root.position.fromArray(pose.viewerPose.positionMeters).negate().applyQuaternion(this.root.quaternion);
    } else {
      this.root.quaternion.identity();
      this.root.position.copy(center).negate();
    }
  }

  dispose() {
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    });
    this.root.removeFromParent();
  }
}

export async function loadQuestSmoothHand(side: 'left' | 'right', color: THREE.ColorRepresentation) {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/quest-hands/${side}.glb`);
  return new QuestSmoothHand(gltf.scene, color);
}
