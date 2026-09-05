import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { CollectionHandPoseTelemetry } from '../model/flywheel';
import { HumanoidRigViewer } from './HumanoidRigViewer';

function handObservation(handedness: 'left' | 'right') {
  return {
    sourcePresent: true,
    poseObserved: true,
    joints: Array.from({ length: 25 }, (_, index) => ({
      name: index === 0 ? 'wrist' : `joint-${String(index)}`,
      positionMeters: [handedness === 'left' ? -0.2 - index * 0.001 : 0.2 + index * 0.001, 1 + index * 0.002, -0.3] as const,
      orientationQuaternion: [0, 0, 0, 1] as const,
      radiusMeters: 0.008,
    })),
  };
}

const handPose: CollectionHandPoseTelemetry = {
  coordinateFrame: 'quest-local-floor',
  deviceTimestampMs: 100,
  receivedTimestampMs: 120,
  hands: {
    left: handObservation('left'),
    right: handObservation('right'),
  },
};

describe('HumanoidRigViewer', () => {
  it('Rig 자세와 수집 상태를 3D 시점별로 표시한다', async () => {
    const user = userEvent.setup();
    render(<HumanoidRigViewer active driftMs={18} poseRateHz={99.6} />);

    const rig = screen.getByRole('region', { name: '휴머노이드 Rig 3D 자세' });
    const modelViewer = rig.querySelector('model-viewer');
    expect(modelViewer).toHaveAttribute(
      'src',
      '/assets/openarm-bimanual-five-finger.glb?motion=2',
    );
    expect(modelViewer).toHaveAttribute(
      'alt',
      'OpenArm v1 기반 5지 양팔 로봇 3D 시각화',
    );
    expect(modelViewer).toHaveAttribute('animation-name', 'Episode Preview');
    expect(modelViewer).toHaveAttribute('autoplay');
    expect(modelViewer).toHaveAttribute('time-scale', '0.85');
    expect(modelViewer).toHaveAttribute('camera-controls');
    expect(modelViewer).toHaveAttribute('camera-orbit', '-45deg 72deg 115%');
    expect(modelViewer).toHaveAttribute('camera-target', '0m 0.4m 0m');
    expect(modelViewer?.querySelectorAll('[slot^="hotspot-"]')).toHaveLength(3);
    expect(screen.getByText('HEAD RGB')).toBeInTheDocument();
    expect(screen.getByText('L HAND')).toBeInTheDocument();
    expect(screen.getByText('R HAND')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('99.6 Hz')).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByText('18 ms')).toBeInTheDocument();
    expect(screen.getByText('양팔 14축 · 6.0s 루프')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'OpenArm 동작 일시정지' }));

    expect(modelViewer).not.toHaveAttribute('autoplay');
    expect(screen.getByRole('button', { name: 'OpenArm 동작 재생' }))
      .toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: '측면' }));

    expect(modelViewer).toHaveAttribute('camera-orbit', '0deg 75deg 110%');
    expect(screen.getByRole('button', { name: '측면' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('관제형 표현에서는 남은 높이를 3D 뷰포트가 채운다', () => {
    render(<HumanoidRigViewer presentation="monitoring" />);

    const rig = screen.getByRole('region', { name: '휴머노이드 Rig 3D 자세' });
    expect(rig).toHaveAttribute('data-presentation', 'monitoring');
    expect(rig).toHaveClass('h-full', 'min-h-0');
    expect(rig.querySelector('model-viewer')).toHaveClass('h-full', 'min-h-0');
    expect(rig.querySelector('model-viewer')?.parentElement)
      .not.toHaveClass('rounded-[var(--design-radius-surface)]', 'bg-layer-canvas');
    expect(screen.queryByText('MOTION')).not.toBeInTheDocument();
    expect(screen.queryByText('Pose')).not.toBeInTheDocument();
    expect(screen.queryByText('연결 카메라')).not.toBeInTheDocument();
    expect(screen.queryByText('동기화 Drift')).not.toBeInTheDocument();
    expect(screen.queryByText('양팔 14축 · 6.0s 루프')).not.toBeInTheDocument();
    expect(screen.queryByText('자세 추정 3D')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'OpenArm 동작 일시정지' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '원근' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '정면' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '측면' })).not.toBeInTheDocument();
  });

  it('OpenArm과 전신·손 융합 3D 스켈레톤을 함께 표시한다', () => {
    render(<HumanoidRigViewer active handPose={handPose} presentation="monitoring" showSkeleton />);

    expect(screen.queryByText('자세 추정 3D')).not.toBeInTheDocument();
    expect(screen.queryByText('OpenArm · 5지 시각화')).not.toBeInTheDocument();
    expect(screen.queryByText('3D 스켈레톤')).not.toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    expect(screen.getByRole('region', {
      name: '전면 RGB 전신과 헤드 RGB 손 추적 3D 스켈레톤',
    })).toBeInTheDocument();
    expect(screen.queryByText('BODY · 전면 RGB')).not.toBeInTheDocument();
    expect(screen.queryByText('HANDS · 헤드 RGB')).not.toBeInTheDocument();
    expect(screen.queryByText('HEAD RGB')).not.toBeInTheDocument();
    expect(screen.queryByText('L HAND')).not.toBeInTheDocument();
    expect(screen.queryByText('R HAND')).not.toBeInTheDocument();
    const rig = screen.getByRole('region', { name: '휴머노이드 Rig 3D 자세' });
    expect(rig.querySelectorAll('model-viewer [data-hand-joint]')).toHaveLength(50);
    expect(rig.querySelectorAll('svg [data-hand-pose]')).toHaveLength(2);
  });
});
