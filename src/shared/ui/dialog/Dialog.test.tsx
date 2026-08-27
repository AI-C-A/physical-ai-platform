import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from '@/shared/ui/button';

import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('닫힌 뒤 포커스를 trigger로 복귀시킨다', async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="이벤트 상세" trigger={<Button>상세 열기</Button>}>
        <p>상세 내용</p>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: '상세 열기' });

    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
