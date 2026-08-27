import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('이동 가능한 이전·다음 버튼은 인접 페이지를 요청한다', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        onPageChange={onPageChange}
        page={2}
        pageSize={20}
        totalItems={60}
      />,
    );

    await user.click(screen.getByRole('button', { name: '이전' }));
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('첫 페이지와 마지막 페이지의 범위 밖 이동을 비활성화한다', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination
        onPageChange={onPageChange}
        page={1}
        pageSize={20}
        totalItems={21}
      />,
    );

    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();

    rerender(
      <Pagination
        onPageChange={onPageChange}
        page={2}
        pageSize={20}
        totalItems={21}
      />,
    );

    expect(screen.getByRole('button', { name: '이전' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('갱신 중에는 현재 버튼 포커스를 유지하면서 페이지 변경을 막는다', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        isPending
        onPageChange={onPageChange}
        page={1}
        pageSize={20}
        totalItems={41}
      />,
    );

    const nextPage = screen.getByRole('button', { name: '다음' });
    nextPage.focus();
    await user.click(nextPage);

    expect(nextPage).toHaveAttribute('aria-disabled', 'true');
    expect(nextPage).toHaveFocus();
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('페이지 결과가 바뀌면 현재 페이지와 총건수를 하나의 상태로 알린다', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination
        onPageChange={onPageChange}
        page={1}
        pageSize={20}
        totalItems={41}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 / 3 페이지 · 총 41건');
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');

    rerender(
      <Pagination
        onPageChange={onPageChange}
        page={2}
        pageSize={20}
        totalItems={41}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('2 / 3 페이지 · 총 41건');
  });
});
