import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('primary 지표를 muted surface와 큰 값으로 강조한다', () => {
    render(<StatTile emphasis="primary" label="전체 로봇" value="12" />);
    const tile = screen.getByRole('article');
    expect(tile).toHaveClass('bg-action-secondary-active', 'border-0');
    expect(screen.getByText('12')).toHaveClass('text-3xl');
  });

  it('secondary 지표는 기본 raised surface를 유지한다', () => {
    render(<StatTile label="가동 로봇" value="9" />);
    expect(screen.getByRole('article')).toHaveAttribute('data-surface-layer', 'raised');
  });
});
