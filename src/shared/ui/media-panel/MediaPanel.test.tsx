import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MediaPanel } from './MediaPanel';

describe('MediaPanel', () => {
  it('공통 surface 곡률과 canvas 레이어로 헤더와 콘텐츠를 함께 자른다', () => {
    const { rerender } = render(
      <MediaPanel aria-label="깊이 뷰" title="깊이" status={<span>결과 대기</span>} footer="상대 깊이">
        <div>내용</div>
      </MediaPanel>,
    );
    const panel = screen.getByRole('region', { name: '깊이 뷰' });
    expect(panel).toHaveClass('rounded-[var(--design-radius-surface)]', 'overflow-hidden', 'bg-layer-canvas', 'border-0', 'p-0');
    expect(panel).toHaveAttribute('data-surface-layer', 'canvas');
    expect(panel).not.toHaveClass('shadow-lg', 'border');
    expect(screen.getByRole('heading', { name: '깊이', level: 3 }).parentElement)
      .toHaveClass('min-h-[var(--layout-control-height)]', 'bg-layer-raised', 'px-3', 'py-2');
    expect(screen.getByText('상대 깊이')).toHaveAttribute('data-media-panel-footer');

    rerender(<MediaPanel aria-label="깊이 뷰" title="깊이"><div>준비</div></MediaPanel>);
    expect(panel).toHaveClass('grid-rows-[auto_minmax(0,1fr)]');
    expect(panel.querySelector('[data-media-panel-footer]')).toBeNull();
  });
});
