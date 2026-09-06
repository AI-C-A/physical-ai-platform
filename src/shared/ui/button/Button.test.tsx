import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('녹화 정지의 비파괴적 강조를 공통 variant가 소유한다', () => {
    render(<Button variant="recording-stop">녹화 정지</Button>);
    expect(screen.getByRole('button', { name: '녹화 정지' })).toHaveClass(
      'text-negative', 'bg-action-secondary', 'hover:bg-status-negative-background', 'active:text-negative',
    );
  });
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
    const content = button.querySelector('[data-button-content]');
    const loader = button.querySelector('[data-button-loader]');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(content).toHaveTextContent('수집 세션 생성');
    expect(content).toHaveClass('opacity-0');
    expect(loader).toHaveAttribute('aria-hidden', 'true');
    expect(loader?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('처리 중…')).not.toBeInTheDocument();
  });

  it('누르는 동안 미세한 scale 피드백을 사용한다', () => {
    render(<Button>확인</Button>);

    expect(screen.getByRole('button', { name: '확인' })).toHaveClass(
      'ui-pressable',
    );
  });

  it('버튼 내용이 바깥 버튼의 가로 정렬을 유지한다', () => {
    render(<Button className="w-full justify-between">왼쪽<span>오른쪽</span></Button>);

    const content = screen
      .getByRole('button', { name: '왼쪽오른쪽' })
      .querySelector('[data-button-content]');
    expect(content).toHaveClass('w-full');
    expect(content?.getAttribute('style')).toContain('gap: inherit');
    expect(content?.getAttribute('style')).toContain(
      'justify-content: inherit',
    );
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
      'text-action-secondary-foreground',
    );
    expect(screen.getByRole('button', { name: '나가기' })).toHaveClass(
      'bg-action-danger',
      'text-action-on-fill',
    );
  });
});
