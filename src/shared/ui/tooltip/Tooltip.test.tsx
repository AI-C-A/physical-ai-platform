import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tooltip, TooltipProvider } from './Tooltip';

describe('Tooltip', () => {
  it('비활성화해도 트리거와 포커스를 유지하며 열린 툴팁을 닫는다', async () => {
    const user = userEvent.setup();
    const trigger = <button type="button">상태 보기</button>;
    const view = render(
      <TooltipProvider><Tooltip content="로봇 상태" trigger={trigger} /></TooltipProvider>,
    );
    const button = screen.getByRole('button', { name: '상태 보기' });
    await user.tab();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    view.rerender(
      <TooltipProvider><Tooltip content="로봇 상태" disabled trigger={trigger} /></TooltipProvider>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상태 보기' })).toBe(button);
    expect(button).toHaveFocus();

    view.rerender(
      <TooltipProvider><Tooltip content="로봇 상태" trigger={trigger} /></TooltipProvider>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.tab();
    await user.tab({ shift: true });
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

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
