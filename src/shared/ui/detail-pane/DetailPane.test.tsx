import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DetailPane } from './DetailPane';

describe('DetailPane', () => {
  it('제목과 설명을 compact raised surface로 구성한다', () => {
    render(
      <DetailPane description="선택한 항목의 정보" title="상세 정보">
        내용
      </DetailPane>,
    );
    const heading = screen.getByRole('heading', { name: '상세 정보', level: 2 });
    const pane = heading.closest('[data-surface-layer]');
    expect(pane).toHaveAttribute('data-surface-layer', 'raised');
    expect(pane).toHaveClass('p-[var(--layout-surface-padding-compact)]');
    expect(screen.getByText('선택한 항목의 정보')).toBeInTheDocument();
  });
});
