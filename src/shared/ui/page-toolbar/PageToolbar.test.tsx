import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageToolbar } from './PageToolbar';

describe('PageToolbar', () => {
  it('정적 raised surface와 반응형 필터 그리드를 사용한다', () => {
    render(
      <PageToolbar aria-label="목록 도구" actions={<button type="button">내보내기</button>}>
        <label>검색<input /></label>
        <label>상태<select /></label>
      </PageToolbar>,
    );

    const toolbar = screen.getByRole('region', { name: '목록 도구' });
    expect(toolbar).toHaveAttribute('data-surface-layer', 'raised');
    expect(toolbar).toHaveClass('border-0');
    expect(toolbar.firstElementChild).toHaveClass('md:grid-cols-2', 'xl:grid-cols-4');
    expect(screen.getByRole('button', { name: '내보내기' })).toBeInTheDocument();
  });
});
