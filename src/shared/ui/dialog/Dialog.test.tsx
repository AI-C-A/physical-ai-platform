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
    expect(screen.getByRole('dialog')).toHaveClass(
      'design-motion-dialog',
      'bg-layer-floating',
      'shadow-xl',
      'backdrop-blur-[var(--design-backdrop-blur-floating)]',
    );
    expect(document.body.querySelector('.design-motion-overlay')).toHaveClass(
      'design-motion-overlay',
    );
    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('확인 액션이 있으면 취소와 나란히 표시한다', async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        actions={<Button variant="danger">삭제</Button>}
        title="항목을 삭제하시겠습니까?"
        trigger={<Button>삭제 열기</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: '삭제 열기' }));

    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('확인 흐름에 맞는 취소 문구를 지정할 수 있다', async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        actions={<Button>저장하고 마치기</Button>}
        cancelLabel="계속 수집"
        title="세션을 저장하고 마칠까요?"
        trigger={<Button>세션 저장</Button>}
      />,
    );

    const trigger = screen.getByRole('button', { name: '세션 저장' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '계속 수집' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
