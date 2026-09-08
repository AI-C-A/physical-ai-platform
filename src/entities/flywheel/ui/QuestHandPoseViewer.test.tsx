import * as THREE from 'three';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CollectionHandPoseTelemetry } from '../model/flywheel';
import { QuestHandPoseViewer } from './QuestHandPoseViewer';
import {
  QUEST_HAND_JOINT_NAMES,
  transformJointToViewer,
  transformHandJoint,
} from './quest-hand-pose-geometry';

function createPose(): CollectionHandPoseTelemetry {
  const hand = (handedness: 'left' | 'right') => ({
    sourcePresent: true,
    poseObserved: true,
    joints: QUEST_HAND_JOINT_NAMES.map((name, index) => ({
      name,
      positionMeters: [
        handedness === 'left' ? -0.2 - index * 0.001 : 0.2 + index * 0.001,
        1 + index * 0.002,
        -0.3 + index * 0.0005,
      ] as const,
      orientationQuaternion: [0, 0, 0, 1] as const,
      radiusMeters: index === 0 ? null : 0.008,
    })),
  });
  return {
    viewerPose: { positionMeters: [0, 1.65, 0], orientationQuaternion: [0, 0, 0, 1] },
    coordinateFrame: 'quest-local-floor',
    deviceTimestampMs: 123.456,
    receivedTimestampMs: 1_800_000_000_000,
    hands: { left: hand('left'), right: hand('right') },
  };
}

describe('QuestHandPoseViewer', () => {
  it('머리 자세 없는 실시간 데이터를 고정 시점으로 대신 표시하지 않는다', () => {
    render(<QuestHandPoseViewer handPose={{ ...createPose(), viewerPose: null }} streamState="live" />);
    expect(screen.getByText(/머리 추적 수신 대기/)).toBeVisible();
  });
  it.each(['offline', 'stale'] as const)('연결 상태 %s에서는 마지막 정상 포즈를 추적으로 표시하지 않는다', (streamState) => {
    const { rerender } = render(<QuestHandPoseViewer handPose={createPose()} streamState={streamState} />);
    expect(screen.queryByText('L 추적')).not.toBeInTheDocument();
    expect(screen.queryByText('R 추적')).not.toBeInTheDocument();
    expect(screen.getByText(streamState === 'offline' ? 'L 연결 끊김' : 'L 수신 지연')).toBeVisible();
    rerender(<QuestHandPoseViewer handPose={createPose()} streamState="recorded" />);
    expect(screen.getByText('L 추적')).toBeVisible();
  });
  it('손 추적 상태와 뷰만 표시하고 설정과 관절 상세를 노출하지 않는다', () => {
    const { rerender } = render(<QuestHandPoseViewer handPose={createPose()} streamState="live" />);
    const viewer = screen.getByRole('region', { name: 'Quest 손 포즈 3D' });

    expect(screen.getByText('손 추적')).toBeVisible();
    expect(viewer).toHaveAttribute('data-media-panel');
    expect(viewer).toHaveClass('rounded-[var(--design-radius-surface)]');
    expect(screen.getByText('L 추적')).toBeVisible();
    expect(screen.getByText('R 추적')).toBeVisible();
    expect(viewer).toHaveAttribute('data-stream-state', 'live');
    expect(viewer.querySelector('button, select, [role="combobox"], details, dl')).toBeNull();
    expect(screen.queryByText(/Quest World|Hand Local|양손|왼손|오른손|시점 초기화|드래그|관절 정보|Position|Orientation|Radius|clock/)).not.toBeInTheDocument();

    rerender(<QuestHandPoseViewer handPose={{ ...createPose(), deviceTimestampMs: 456 }} streamState="recorded" />);
    expect(screen.getByRole('region', { name: 'Quest 손 포즈 3D' })).toBe(viewer);
    expect(viewer).toHaveAttribute('data-stream-state', 'recorded');
    expect(screen.getByText('L 추적')).toBeVisible();
    expect(screen.getByText('R 추적')).toBeVisible();
  });

  it('관측되지 않은 pose를 이전 자세로 채우지 않고 상태를 구분한다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pose = createPose();
    render(<QuestHandPoseViewer handPose={{
      ...pose,
      hands: {
        left: { sourcePresent: true, poseObserved: false, joints: [] },
        right: { sourcePresent: false, poseObserved: false, joints: [] },
      },
    }} streamState="live" />);

    expect(screen.getByText('L 부분')).toBeInTheDocument();
    expect(screen.getByText('R 유실')).toBeInTheDocument();
    expect(screen.getByText('손 프레임 대기')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('손목 quaternion의 역회전으로 Hand Local 좌표를 계산한다', () => {
    const halfSqrt = Math.sqrt(0.5);
    const wrist = {
      name: 'wrist',
      positionMeters: [0, 0, 0] as const,
      orientationQuaternion: [0, 0, halfSqrt, halfSqrt] as const,
      radiusMeters: 0.008,
    };
    const joint = {
      ...wrist,
      name: 'index-finger-tip',
      positionMeters: [0, 1, 0] as const,
    };

    const transformed = transformHandJoint(joint, wrist, 'left', 'hand-local');
    expect(transformed[0]).toBeCloseTo(0.89, 6);
    expect(transformed[1]).toBeCloseTo(0, 6);
    expect(transformed[2]).toBeCloseTo(0, 6);
  });
});


describe('Quest egocentric projection', () => {
  it('머리와 손이 함께 이동·회전해도 눈에 보이는 손 위치는 유지된다', () => {
    const camera = new THREE.PerspectiveCamera(38, 1.6, 0.001, 10);
    const left = new THREE.Vector3(-0.15, -0.2, -0.45);
    const right = new THREE.Vector3(0.15, -0.2, -0.45);
    camera.fov = 85;
    camera.updateProjectionMatrix();
    const expected = [left, right].map((point) => point.clone().project(camera));
    expect(expected[0]!.x).toBeLessThan(0);
    expect(expected[1]!.x).toBeGreaterThan(0);
    expect(expected[0]!.y).toBeLessThan(0);
    const position = new THREE.Vector3(2, 1.65, -3);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 1.2, 0.1));
    const pose = { positionMeters: position.toArray(), orientationQuaternion: rotation.toArray() };
    [left, right].forEach((point, index) => {
      const world = point.clone().applyQuaternion(rotation).add(position);
      const actual = transformJointToViewer(world.toArray(), pose).project(camera);
      expect(actual.distanceTo(expected[index]!)).toBeLessThan(1e-10);
    });
  });
});
