import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RobotModelViewer } from './RobotModelViewer';

describe('RobotModelViewer', () => {
  it('반대쪽 전면과 측면 사이의 위쪽 시점에서 계속 걷는다', () => {
    render(<RobotModelViewer nickname="Mock Robot" />);

    const modelViewer = screen.getByRole('group', { name: '로봇 3D 모델' })
      .querySelector('model-viewer');
    expect(modelViewer).toHaveAttribute('camera-orbit', '-135deg 65deg 105%');
    expect(modelViewer).toHaveAttribute('autoplay');
    expect(modelViewer).not.toHaveAttribute('auto-rotate');
    expect(screen.getByText('Mock Robot')).toHaveClass('text-xl', 'md:text-4xl', 'md:font-light');
  });

  it('모션 감소 환경에서 자동 재생하지 않고 실행 중 설정 변경도 반영한다', () => {
    let reduced = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reduced; },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    const view = render(<RobotModelViewer />);
    try {
      const model = screen.getByRole('group', { name: '로봇 3D 모델' })
        .querySelector('model-viewer') as HTMLElement & { pause: () => void };
      model.pause = vi.fn();
      expect(model).not.toHaveAttribute('autoplay');
      act(() => { reduced = false; listeners.forEach((listener) => listener()); });
      expect(model).toHaveAttribute('autoplay');
      act(() => { reduced = true; listeners.forEach((listener) => listener()); });
      expect(model).not.toHaveAttribute('autoplay');
      expect(model.pause).toHaveBeenCalledOnce();
      view.unmount();
      expect(listeners.size).toBe(0);
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
    }
  });
});
