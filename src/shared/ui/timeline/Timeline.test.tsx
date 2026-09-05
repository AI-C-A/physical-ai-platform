import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { Timeline } from './Timeline';

it('선택 동작이 없는 이벤트는 버튼으로 표시하지 않는다', () => {
  render(<Timeline durationLabel="1분" markers={[{ id: 'contact', label: '접촉', offsetPercent: 25 }]} />);
  expect(screen.getByText('접촉')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('선택 가능한 이벤트를 키보드로 실행한다', async () => {
  const select = vi.fn();
  const marker = { id: 'contact', label: '접촉', offsetPercent: 25 };
  render(<Timeline durationLabel="1분" markers={[marker]} onMarkerSelect={select} />);
  screen.getByRole('button', { name: '접촉' }).focus();
  await userEvent.keyboard('{Enter}');
  expect(select).toHaveBeenCalledWith(marker);
});
