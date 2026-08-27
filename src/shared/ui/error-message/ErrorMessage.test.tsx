import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ErrorMessage } from './ErrorMessage';

describe('ErrorMessage', () => {
  it('오류 문구를 일관된 alert로 제공한다', () => {
    render(<ErrorMessage>목록을 불러오지 못했습니다.</ErrorMessage>);

    expect(screen.getByRole('alert')).toHaveTextContent('목록을 불러오지 못했습니다.');
  });
});
