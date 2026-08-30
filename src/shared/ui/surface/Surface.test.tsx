import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Surface } from './Surface';

describe('Surface', () => {
  it('정적 raised 표면은 외곽 보더와 그림자를 사용하지 않는다', () => {
    render(<Surface aria-label="업무 표면">내용</Surface>);

    const surface = screen.getByRole('region', { name: '업무 표면' });
    expect(surface).toHaveClass('border-0', 'bg-layer-raised');
    expect(surface).not.toHaveClass('shadow-sm', 'shadow-lg', 'shadow-xl');
  });

  it('실제로 떠 있는 표면에만 elevation을 적용한다', () => {
    render(
      <Surface aria-label="떠 있는 표면" layer="floating">
        내용
      </Surface>,
    );

    expect(screen.getByRole('region', { name: '떠 있는 표면' })).toHaveClass(
      'bg-layer-floating',
      'shadow-lg',
    );
  });
});
