import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/shared/ui/button';

import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('Content가 제거된 뒤 닫기 완료를 한 번 알린다', async () => {
    const user = userEvent.setup();
    const onAfterClose = vi.fn(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    render(<Dialog title="상세" onAfterClose={onAfterClose} trigger={<Button>열기</Button>} />);
    await user.click(screen.getByRole('button', { name: '열기' }));
    expect(onAfterClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onAfterClose).toHaveBeenCalledOnce());
  });

  it('열린 채 부모가 제거되면 닫기 후 라우팅을 실행하지 않는다', async () => {
    const onAfterClose = vi.fn();
    const onCloseAutoFocus = vi.fn();
    const { unmount } = render(<Dialog open title="상세" onAfterClose={onAfterClose} onCloseAutoFocus={onCloseAutoFocus} />);
    unmount();
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalled());
    expect(onAfterClose).not.toHaveBeenCalled();
  });

  it('처리 중에는 Escape로도 닫히지 않는다', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Dialog open cancelDisabled title="처리 중" onOpenChange={onOpenChange} />);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('닫히는 도중 부모가 제거되면 오래된 완료 콜백을 취소한다', async () => {
    const onAfterClose = vi.fn();
    const onCloseAutoFocus = vi.fn();
    const { rerender, unmount } = render(<Dialog open title="상세" onAfterClose={onAfterClose} onCloseAutoFocus={onCloseAutoFocus} />);
    rerender(<Dialog open={false} title="상세" onAfterClose={onAfterClose} onCloseAutoFocus={onCloseAutoFocus} />);
    unmount();
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalled());
    expect(onAfterClose).not.toHaveBeenCalled();
  });

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
