import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('포커스 복원이 필요한 흐름에 실제 버튼 ref를 제공한다', () => {
    const buttonRef = createRef<HTMLButtonElement>();
    render(<Button buttonRef={buttonRef}>선택 취소</Button>);

    expect(buttonRef.current).toBe(
      screen.getByRole('button', { name: '선택 취소' }),
    );
  });

  it('처리 중에도 원래 작업 이름과 busy 상태를 유지한다', () => {
    render(<Button isLoading>수집 세션 생성</Button>);

    const button = screen.getByRole('button', { name: '수집 세션 생성' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('처리 중…')).not.toBeInTheDocument();
  });

  it('variant별 의미 색상 토큰을 사용한다', () => {
    render(
      <>
        <Button>확인</Button>
        <Button variant="secondary">취소</Button>
        <Button variant="danger">나가기</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: '확인' })).toHaveClass(
      'bg-action-primary',
      'text-action-on-fill',
    );
    expect(screen.getByRole('button', { name: '취소' })).toHaveClass(
      'bg-action-secondary',
      'text-foreground',
    );
    expect(screen.getByRole('button', { name: '나가기' })).toHaveClass(
      'bg-action-danger',
      'text-action-on-fill',
    );
  });
});
