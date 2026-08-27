import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('별도 상태 문구가 있으면 장식 요소로 숨긴다', () => {
    render(<Spinner data-testid="spinner" />);

    expect(screen.getByTestId('spinner')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('단독으로 사용할 때 label을 접근 가능한 상태 이름으로 제공한다', () => {
    render(<Spinner label="카메라 연결 중" />);

    expect(screen.getByRole('status', { name: '카메라 연결 중' })).toBeInTheDocument();
  });
});
