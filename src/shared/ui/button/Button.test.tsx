import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('처리 중에도 원래 작업 이름과 busy 상태를 유지한다', () => {
    render(<Button isLoading>수집 세션 생성</Button>);

    const button = screen.getByRole('button', { name: '수집 세션 생성' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('처리 중…')).not.toBeInTheDocument();
  });
});
