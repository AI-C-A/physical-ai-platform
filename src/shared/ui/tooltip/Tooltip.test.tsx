import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tooltip, TooltipProvider } from './Tooltip';

describe('Tooltip', () => {
  it('공통 반투명 플로팅 표면을 사용한다', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip content="로봇 상태" trigger={<button type="button">상태 보기</button>} />
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole('button', { name: '상태 보기' }));

    expect(await screen.findByRole('tooltip')).toHaveClass(
      'design-motion-tooltip',
      'bg-layer-floating',
      'shadow-lg',
      'backdrop-blur-[var(--design-backdrop-blur-floating)]',
    );
  });
});
