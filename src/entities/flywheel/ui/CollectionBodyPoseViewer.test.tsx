import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectionBodyPoseViewer } from './CollectionBodyPoseViewer';

describe('CollectionBodyPoseViewer', () => {
  it('실제 모델을 사용하고 WebGL 실패 시 복구 방법을 표시한다', async () => {
    render(<CollectionBodyPoseViewer />);
    const panel = screen.getByRole('region', { name: '전신 휴머노이드 3D' });
    expect(panel).toHaveAttribute('data-media-panel');
    expect(panel).toHaveClass('rounded-[var(--design-radius-surface)]', 'overflow-hidden');
    expect(screen.getByText('기준 모델')).toBeVisible();
    expect(panel.querySelector('model-viewer')).toHaveAttribute('src', '/assets/unitree-g1.glb');
    expect(panel.querySelector('model-viewer')).not.toHaveAttribute('autoplay');
    expect(await screen.findByText(/3D 모델을 표시할 수 없습니다/)).toBeVisible();
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  });
});
