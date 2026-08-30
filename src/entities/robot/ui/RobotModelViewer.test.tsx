import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RobotModelViewer } from './RobotModelViewer';

describe('RobotModelViewer', () => {
  it('반대쪽 전면과 측면 사이의 위쪽 시점에서 계속 걷는다', () => {
    render(<RobotModelViewer nickname="Mock Robot" />);

    const modelViewer = screen.getByRole('group', { name: '로봇 3D 모델' })
      .querySelector('model-viewer');
    expect(modelViewer).toHaveAttribute('camera-orbit', '-135deg 65deg 105%');
    expect(modelViewer).toHaveAttribute('autoplay');
    expect(modelViewer).not.toHaveAttribute('auto-rotate');
    expect(screen.getByText('Mock Robot')).toHaveClass('text-4xl', 'font-light');
  });
});
