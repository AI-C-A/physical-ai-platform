import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StickyActionBar } from './StickyActionBar';

describe('StickyActionBar', () => {
  it('viewport 모드에서 주 액션을 화면 하단에 고정한다', () => {
    render(<StickyActionBar aria-label="작업" position="viewport">저장</StickyActionBar>);
    expect(screen.getByRole('region', { name: '작업' })).toHaveClass('fixed', 'bottom-0');
  });

  it('responsive pane 모드는 작은 화면에 고정하고 큰 화면에서는 pane 흐름으로 돌아간다', () => {
    render(<StickyActionBar aria-label="설정 작업" position="responsive-pane">생성</StickyActionBar>);
    expect(screen.getByRole('region', { name: '설정 작업' })).toHaveClass('fixed', 'lg:static');
  });
});
