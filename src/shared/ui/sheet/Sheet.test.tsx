import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from '@/shared/ui/button';

import { Sheet } from './Sheet';

describe('Sheet', () => {
  it('왼쪽 패널 모션을 사용하고 닫힌 뒤 trigger로 포커스를 복귀시킨다', async () => {
    const user = userEvent.setup();
    render(
      <Sheet title="로봇 메뉴" trigger={<Button>메뉴 열기</Button>}>
        <p>메뉴 내용</p>
      </Sheet>,
    );
    const trigger = screen.getByRole('button', { name: '메뉴 열기' });

    await user.click(trigger);
    expect(screen.getByRole('dialog')).toHaveClass(
      'design-motion-sheet',
      'bg-layer-floating',
    );
    expect(document.body.querySelector('.design-motion-overlay')).toHaveClass(
      'design-motion-overlay',
    );

    await user.click(screen.getByRole('button', { name: '메뉴 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
