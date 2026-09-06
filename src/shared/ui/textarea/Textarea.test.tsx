import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('스타일을 추가해도 기본 필드를 유지하고 오류와 기존 안내를 함께 연결한다', () => {
    const view = render(<>
      <p id="instructions-hint">작업 순서를 적으세요.</p>
      <Textarea aria-describedby="instructions-hint" className="w-full" error="작업 지시가 필요합니다." label="작업 지시" />
    </>);
    const input = screen.getByRole('textbox', { name: '작업 지시' });
    expect(input).toHaveClass('ui-field', 'w-full');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('작업 순서를 적으세요. 작업 지시가 필요합니다.');
    view.rerender(<>
      <p id="instructions-hint">작업 순서를 적으세요.</p>
      <Textarea aria-describedby="instructions-hint" label="작업 지시" />
    </>);
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('작업 순서를 적으세요.');
  });

  it('공통 입력 곡률과 배경을 사용하고 label과 disabled를 유지한다', () => {
    render(<Textarea label="작업 지시" disabled defaultValue="과일 분류" />);
    const input = screen.getByRole('textbox', { name: '작업 지시' });
    expect(input).toHaveClass('ui-field', 'rounded-[var(--design-radius-field)]');
    expect(input).not.toHaveClass('rounded-md', 'bg-surface');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('과일 분류');
  });
});
