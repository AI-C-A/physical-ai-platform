import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelViewer } from './ModelViewer';

beforeEach(() => {
  vi.stubGlobal('WebGLRenderingContext', class {});
  vi.spyOn(customElements, 'get').mockReturnValue(class extends HTMLElement {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ModelViewer', () => {
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
