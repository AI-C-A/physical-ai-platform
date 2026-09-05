import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $scene } from '@google/model-viewer/lib/model-viewer-base.js';

import { ModelViewer, type ModelViewerElement } from './ModelViewer';

beforeEach(() => {
  vi.stubGlobal('WebGLRenderingContext', class {});
  vi.spyOn(customElements, 'get').mockReturnValue(class extends HTMLElement {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ModelViewer', () => {
  it('이름이 지정된 GLB 노드를 두 관절 사이의 실제 segment로 변환하고 reset한다', () => {
    const view = render(
      <ModelViewer
        alt="관절 시험 모델"
        errorFallback={() => null}
        loadingFallback={null}
        src="/assets/test.glb"
      />,
    );
    const modelViewer = view.container.querySelector('model-viewer') as ModelViewerElement | null;
    if (modelViewer === null) throw new Error('model-viewer element가 필요합니다.');
    const position = { x: 1, y: 2, z: 3, set: vi.fn() };
    position.set.mockImplementation((x: number, y: number, z: number) => {
      position.x = x;
      position.y = y;
      position.z = z;
    });
    const quaternion = { x: 0, y: 0, z: 0, w: 1, set: vi.fn(), setFromUnitVectors: vi.fn() };
    const scale = { x: 0.1, y: 0.2, z: 0.3, set: vi.fn() };
    scale.set.mockImplementation((x: number, y: number, z: number) => {
      scale.x = x;
      scale.y = y;
      scale.z = z;
    });
    const node = { position, quaternion, scale };
    const queueRender = vi.fn();
    Object.defineProperty(modelViewer, $scene, {
      value: { target: { getObjectByName: () => node }, queueRender },
    });

    modelViewer.setNodePoses?.([{
      name: 'finger-proximal',
      start: [0, 0, 0],
      end: [0, 0.04, 0],
    }]);

    expect(position.set).toHaveBeenLastCalledWith(0, 0.02, 0);
    expect(quaternion.setFromUnitVectors).toHaveBeenCalledWith(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
    );
    expect(scale.z).toBeCloseTo(0.04);
    expect(queueRender).toHaveBeenCalledOnce();

    modelViewer.setNodePoses?.([{ name: 'finger-proximal', reset: true }]);
    expect(position.set).toHaveBeenLastCalledWith(1, 2, 3);
    expect(quaternion.set).toHaveBeenLastCalledWith(0, 0, 0, 1);
    expect(scale.set).toHaveBeenLastCalledWith(0.1, 0.2, 0.3);
  });

  it('load 오류 뒤 같은 element의 source를 다시 요청하고 Ready로 복구한다', () => {
    const view = render(
      <ModelViewer
        alt="시험 3D 모델"
        errorFallback={(retry) => (
          <button onClick={retry} type="button">다시 시도</button>
        )}
        loadingFallback={<span role="status">불러오는 중</span>}
        src="/assets/test.glb"
      />,
    );
    const modelViewer = view.container.querySelector('model-viewer');
    expect(modelViewer).not.toBeNull();
    if (modelViewer === null) throw new Error('model-viewer element가 필요합니다.');
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');

    fireEvent.load(modelViewer);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.error(modelViewer);
    const removeAttribute = vi.spyOn(modelViewer, 'removeAttribute');
    const setAttribute = vi.spyOn(modelViewer, 'setAttribute');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
    expect(view.container.querySelector('model-viewer')).toBe(modelViewer);
    expect(removeAttribute).toHaveBeenCalledWith('src');
    expect(setAttribute).toHaveBeenCalledWith('src', '/assets/test.glb');

    fireEvent.load(modelViewer);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' }))
      .not.toBeInTheDocument();
  });
});
