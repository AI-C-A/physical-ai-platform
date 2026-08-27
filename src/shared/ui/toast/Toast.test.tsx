import { render, screen } from '@testing-library/react';
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
  });

  it('Provider가 사라질 때 남아 있는 알림 제거 timer를 정리한다', async () => {
    const user = userEvent.setup();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(
      <ToastProvider><ToastTrigger /></ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '성공 알림' }));
    await user.click(screen.getByRole('button', { name: '오류 알림' }));
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
    clearTimeoutSpy.mockRestore();
  });
});
