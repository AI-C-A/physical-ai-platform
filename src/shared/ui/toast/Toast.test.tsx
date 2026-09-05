import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from './Toast';
import { useToast } from './toast-context';

function ToastTrigger() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('저장했습니다.')} type="button">성공 알림</button>
      <button onClick={() => showToast('저장 실패', 'error')} type="button">오류 알림</button>
      <button
        onClick={() => {
          for (let index = 1; index <= 4; index += 1) {
            showToast(`오류 ${String(index)}`, 'error');
          }
        }}
        type="button"
      >
        알림 쌓기
      </button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('각 메시지가 단일 live role만 소유해 중복 안내를 만들지 않는다', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ToastProvider><ToastTrigger /></ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '성공 알림' }));
    await user.click(screen.getByRole('button', { name: '오류 알림' }));

    expect(screen.getByRole('status')).toHaveTextContent('저장했습니다.');
    expect(screen.getByRole('alert')).toHaveTextContent('저장 실패');
    expect(container.querySelector('[aria-live]')).toBeNull();
    const viewport = document.body.querySelector('[data-toast-viewport]');
    expect(viewport).toHaveClass(
      'top-[var(--layout-toast-offset)]',
      'max-w-[var(--layout-toast-max-width)]',
      'gap-[var(--layout-toast-gap)]',
      'z-[var(--design-z-toast)]',
    );
    expect(viewport?.querySelectorAll(':scope > [data-toast-layout-id]')).toHaveLength(2);
    expect(viewport?.parentElement).toBe(document.body);
    expect(container).not.toContainElement(viewport as HTMLElement);
    expect(viewport).not.toHaveAttribute('data-color-scheme');
    expect(viewport).not.toHaveAttribute('data-color-layer');
    const closeButtons = screen.getAllByRole('button', { name: '알림 닫기' });
    expect(closeButtons).toHaveLength(2);
    expect(closeButtons.every((button) => button.querySelector('svg') !== null)).toBe(true);
    expect(closeButtons.map((button) => button.getAttribute('aria-describedby')))
      .toEqual([
        screen.getByRole('status').id,
        screen.getByRole('alert').id,
      ]);
    const firstCloseButton = closeButtons[0];
    if (firstCloseButton === undefined) throw new Error('첫 번째 알림 닫기 버튼이 없습니다.');
    const successToast = document.body.querySelector('[data-toast-tone="success"]');
    const errorToast = document.body.querySelector('[data-toast-tone="error"]');
    expect(successToast).toHaveClass(
      'design-motion-toast',
      'rounded-[var(--design-radius-surface)]',
      'bg-layer-floating',
      'shadow-md',
      'backdrop-blur-[var(--design-backdrop-blur-floating)]',
      'px-[var(--layout-toast-padding-inline)]',
      'py-[var(--layout-toast-padding-block)]',
    );
    expect(successToast).not.toHaveClass('shadow-lg', 'backdrop-blur-xl');
    expect(successToast).toHaveAttribute('data-toast-state', 'open');
    expect(firstCloseButton).toHaveClass(
      'size-10',
      'min-h-[var(--layout-control-height)]',
      'rounded-[var(--design-radius-control)]',
      'bg-transparent',
      'hover:bg-action-secondary-hover',
      'active:bg-action-secondary-active',
    );
    expect(firstCloseButton).not.toHaveClass('rounded-full', 'min-h-8');
    expect(successToast?.querySelector('[data-toast-status-icon]')).toHaveClass(
      'text-status-positive-foreground',
    );
    expect(errorToast?.querySelector('[data-toast-status-icon]')).toHaveClass(
      'text-status-negative-foreground',
    );
    expect(successToast?.querySelector('[data-toast-status-icon] svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    await user.click(firstCloseButton);
    expect(successToast).toHaveAttribute('data-toast-state', 'exiting');
    expect(screen.getByRole('status')).toBeInTheDocument();
    if (!(successToast instanceof HTMLElement)) {
      throw new Error('성공 알림이 없습니다.');
    }
    fireEvent.animationEnd(successToast);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('동시에 표시하는 알림을 세 개로 제한하고 가장 오래된 알림부터 제거한다', () => {
    render(<ToastProvider><ToastTrigger /></ToastProvider>);

    fireEvent.click(screen.getByRole('button', { name: '알림 쌓기' }));

    expect(screen.queryByText('오류 1')).not.toBeInTheDocument();
    expect(screen.getByText('오류 2')).toBeInTheDocument();
    expect(screen.getByText('오류 3')).toBeInTheDocument();
    expect(screen.getByText('오류 4')).toBeInTheDocument();
    expect(document.body.querySelectorAll('[data-toast-tone]')).toHaveLength(3);
    expect(document.body.querySelectorAll('[data-toast-layout-id]')).toHaveLength(3);
  });

  it('사용자가 토스트를 가리키는 동안 성공 알림의 자동 닫힘을 멈춘다', async () => {
    vi.useFakeTimers();
    try {
      render(<ToastProvider><ToastTrigger /></ToastProvider>);
      fireEvent.click(screen.getByRole('button', { name: '성공 알림' }));
      const toast = document.body.querySelector('[data-toast-tone="success"]');
      if (!(toast instanceof HTMLElement)) throw new Error('성공 알림이 없습니다.');

      fireEvent.pointerEnter(toast);
      await act(() => vi.advanceTimersByTime(4_000));
      expect(screen.getByRole('status')).toBeInTheDocument();

      fireEvent.pointerLeave(toast);
      await act(() => vi.advanceTimersByTime(3_999));
      expect(screen.getByRole('status')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTime(1));
      expect(toast).toHaveAttribute('data-toast-state', 'exiting');
      fireEvent.animationEnd(toast);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('성공은 4초 후 닫고 오류는 사용자가 확인할 때까지 유지한다', async () => {
    vi.useFakeTimers();
    try {
      render(<ToastProvider><ToastTrigger /></ToastProvider>);
      fireEvent.click(screen.getByRole('button', { name: '성공 알림' }));
      fireEvent.click(screen.getByRole('button', { name: '오류 알림' }));

      await act(() => vi.advanceTimersByTime(3_999));
      expect(screen.getByRole('status')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole('status').closest('[data-toast-state]'))
        .toHaveAttribute('data-toast-state', 'exiting');
      await act(() => vi.advanceTimersByTime(249));
      expect(screen.getByRole('status')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('저장 실패');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Provider가 사라질 때 남아 있는 성공 알림 timer를 정리한다', async () => {
    const user = userEvent.setup();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(
      <ToastProvider><ToastTrigger /></ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '성공 알림' }));
    await user.click(screen.getByRole('button', { name: '오류 알림' }));
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    clearTimeoutSpy.mockRestore();
  });
});
