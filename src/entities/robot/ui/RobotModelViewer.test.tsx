import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RobotModelViewer } from './RobotModelViewer';

describe('RobotModelViewer', () => {
  it('로봇 선택이 바뀌면 해당 유형의 모델과 설명으로 전환한다', () => {
    const view = render(<RobotModelViewer robotType="humanoid" />);
    const model = () => screen.getByRole('group', { name: '로봇 3D 모델' }).querySelector('model-viewer');
    expect(model()).toHaveAttribute('src', '/assets/openarm-bimanual-five-finger.glb');
    expect(model()).toHaveAttribute('alt', '양팔형 로봇 (오픈암 스타일) 3D 모델');
    view.rerender(<RobotModelViewer robotType="mobile" />);
    expect(model()).toHaveAttribute('src', '/assets/four-wheel-rover.glb');
    expect(model()).toHaveAttribute('alt', '사륜 로봇 3D 모델');
    view.rerender(<RobotModelViewer robotType="quadruped" />);
    expect(model()).toHaveAttribute('src', '/assets/rbq10_walk.glb');
    expect(model()).toHaveAttribute('alt', '사족보행 로봇 3D 모델');
    expect(model()).toHaveAttribute('orientation', '0deg -90deg 0deg');
  });

  it('전면과 측면 사이의 위쪽 시점에서 모델을 표시한다', () => {
    render(<RobotModelViewer nickname="Mock Robot" />);

    const modelViewer = screen.getByRole('group', { name: '로봇 3D 모델' })
      .querySelector('model-viewer');
    expect(modelViewer).toHaveAttribute('camera-orbit', '45deg 65deg 105%');
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
