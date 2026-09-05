import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusIndicator } from './StatusIndicator';

describe('StatusIndicator', () => {
  it('색상 외에 텍스트로 상태를 전달한다', () => {
    render(<StatusIndicator label="필수 소스 5/5 준비" tone="positive" />);
    expect(screen.getByText('필수 소스 5/5 준비')).toBeVisible();
  });
});
