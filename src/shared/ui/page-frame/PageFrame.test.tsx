import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageFrame } from './PageFrame';

describe('PageFrame', () => {
  it.each([
    ['standard', 'standard'],
    ['wide', 'wide'],
    ['focused', 'focused'],
    ['full-bleed', 'full-bleed'],
    ['immersive', 'immersive'],
  ] as const)('%s 레이아웃 계약을 노출한다', (layout, expected) => {
    render(<PageFrame data-testid="frame" layout={layout}>내용</PageFrame>);
    expect(screen.getByTestId('frame')).toHaveAttribute('data-page-frame', expected);
  });

  it('focused 레이아웃은 작업 폭을 제한한다', () => {
    render(<PageFrame data-testid="frame" layout="focused">내용</PageFrame>);
    expect(screen.getByTestId('frame')).toHaveClass(
      'max-w-[var(--layout-focused-width)]',
    );
  });
});
