/// <reference types="node" />
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';

import type { CollectionHandPoseTelemetry } from '../model/flywheel';
import { QUEST_HAND_JOINT_NAMES } from './quest-hand-pose-geometry';
import { QuestSmoothHand } from './quest-smooth-hand';

describe('smooth WebXR hand assets', () => {
  it.each(['left', 'right'] as const)('%s mesh follows all joints and the viewer without double transforms', async (side) => {
    const bytes = await readFile(`public/assets/quest-hands/${side}.glb`);
    const { scene } = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
    const mesh = scene.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
    expect(mesh).toBeDefined();
    const original = mesh.geometry.getAttribute('position');
    const translation = new THREE.Vector3(1, 2, -3);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.4, -0.3));
    const joints = QUEST_HAND_JOINT_NAMES.map((name) => {
      const bone = scene.getObjectByName(name)!;
      expect(bone.parent?.name).toBe('Armature');
      return { name, positionMeters: bone.position.clone().applyQuaternion(rotation).add(translation).toArray(),
        orientationQuaternion: rotation.clone().multiply(bone.quaternion).toArray(), radiusMeters: 0.008 };
    });
    const observation = { sourcePresent: true, poseObserved: true, joints };
    const pose: CollectionHandPoseTelemetry = {
      coordinateFrame: 'quest-local-floor', deviceTimestampMs: 1, receivedTimestampMs: 1,
      hands: { left: observation, right: observation },
      viewerPose: { positionMeters: translation.toArray(), orientationQuaternion: rotation.toArray() },
    };
    const hand = new QuestSmoothHand(scene, 'white');
    hand.update(pose, side, new THREE.Vector3());
    hand.root.updateMatrixWorld(true);
    mesh.skeleton.update();
    expect(hand.root.visible).toBe(true);
    // Moving head and hand together must leave the rendered surface unchanged.
    for (let index = 0; index < original.count; index += 53) {
      const actual = mesh.localToWorld(mesh.getVertexPosition(index, new THREE.Vector3()));
      expect(actual.distanceTo(new THREE.Vector3().fromBufferAttribute(original, index))).toBeLessThan(0.00001);
    }
    hand.update({ ...pose, hands: { ...pose.hands, [side]: { ...observation, poseObserved: false, joints: [] } } }, side, new THREE.Vector3());
    expect(hand.root.visible).toBe(false);
    hand.update(pose, side, new THREE.Vector3());
    expect(hand.root.visible).toBe(true);
    hand.dispose();
  });
});
