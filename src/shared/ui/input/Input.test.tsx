import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './Input';

describe('Input', () => {
  it('외부 입력 안내와 검증 오류를 함께 연결하고 오류가 해결되면 안내만 유지한다', () => {
    const view = render(
      <>
        <p id="name-hint">2자 이상 입력하세요.</p>
        <Input aria-describedby="name-hint" aria-invalid={false} error="이름을 입력하세요." label="수집 이름" />
      </>,
    );
    const input = screen.getByRole('textbox', { name: '수집 이름' });
    expect(input).toHaveAccessibleDescription('2자 이상 입력하세요. 이름을 입력하세요.');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    view.rerender(
      <>
        <p id="name-hint">2자 이상 입력하세요.</p>
        <Input aria-describedby="name-hint" label="수집 이름" />
      </>,
    );
    expect(input).toHaveAccessibleDescription('2자 이상 입력하세요.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});
