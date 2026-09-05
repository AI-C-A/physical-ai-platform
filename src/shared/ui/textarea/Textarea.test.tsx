import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('공통 입력 곡률과 배경을 사용하고 label과 disabled를 유지한다', () => {
    render(<Textarea label="작업 지시" disabled defaultValue="과일 분류" />);
    const input = screen.getByRole('textbox', { name: '작업 지시' });
    expect(input).toHaveClass('rounded-[var(--design-radius-control)]', 'bg-layer-base');
    expect(input).not.toHaveClass('rounded-md', 'bg-surface');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('과일 분류');
  });
});
