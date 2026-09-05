import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OperationalStrip } from './OperationalStrip';

describe('OperationalStrip', () => {
  it('판단 순서대로 label, 핵심값, 세부값을 표시한다', () => {
    render(
      <OperationalStrip
        aria-label="운영 요약"
        items={[{ label: '필수 소스', value: '3/3 준비', detail: '실시간' }]}
      />,
    );
    expect(screen.getByRole('region', { name: '운영 요약' })).toHaveTextContent('필수 소스3/3 준비실시간');
  });
});
