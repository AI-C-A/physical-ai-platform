import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CollectionHandPoseTelemetry } from '../model/flywheel';
import { QuestHandPoseViewer } from './QuestHandPoseViewer';
import {
  QUEST_HAND_JOINT_NAMES,
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
    coordinateFrame: 'quest-local-floor',
    deviceTimestampMs: 123.456,
    receivedTimestampMs: 1_800_000_000_000,
    hands: { left: hand('left'), right: hand('right') },
  };
}

describe('QuestHandPoseViewer', () => {
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
    }} />);

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
