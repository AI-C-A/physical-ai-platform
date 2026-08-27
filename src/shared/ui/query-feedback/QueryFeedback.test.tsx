import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryFeedback } from './QueryFeedback';

describe('QueryFeedback', () => {
  it('오류를 중첩 live region 없이 하나의 alert로 알린다', () => {
    render(
      <QueryFeedback
        kind="error"
        message="목록을 불러오지 못했습니다."
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').closest('[aria-live]')).toBeNull();
  });

  it('로딩 안내를 busy 조상에 가두지 않고 하나의 status로 알린다', () => {
    render(<QueryFeedback kind="loading" />);

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
    expect(screen.getByRole('status').closest('[aria-live]')).toBeNull();
  });
});
