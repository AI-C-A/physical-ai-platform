import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tabs, type TabItem } from './Tabs';

const items: readonly TabItem[] = [
  { content: <p>현재 상태 내용</p>, label: '현재 상태', value: 'status' },
  { content: <p>이벤트 내용</p>, label: '이벤트', value: 'events' },
];

function mockTriggerMeasurements() {
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    return this.textContent === '이벤트' ? 84 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.textContent === '이벤트' ? 96 : 80;
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Tabs', () => {
  it('compact 밀도는 공통 조작 높이와 작은 글자 크기를 소유한다', async () => {
    const user = userEvent.setup();
    render(<Tabs defaultValue="status" density="compact" items={items} />);
    const status = screen.getByRole('tab', { name: '현재 상태' });
    expect(status).toHaveClass('min-h-[var(--layout-control-height)]', 'text-xs', 'flex-auto');
    status.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '이벤트' })).toHaveFocus();
    expect(screen.getByText('이벤트 내용')).toBeVisible();
  });
  it('첫 indicator 배치는 즉시 수행하고 이후 선택은 220ms 토큰으로 이동한다', async () => {
    mockTriggerMeasurements();
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Tabs
        defaultValue="status"
        items={items}
        onValueChange={onValueChange}
      />,
    );
    const indicator = document.querySelector('[data-tabs-indicator]');

    expect(indicator).toHaveStyle({
      opacity: '1',
      transform: 'translateX(0px)',
      transitionDuration: '0ms',
      width: '80px',
    });

    await user.click(screen.getByRole('tab', { name: '이벤트' }));
    expect(onValueChange).toHaveBeenCalledWith('events');
    expect(indicator).toHaveStyle({
      transform: 'translateX(84px)',
      transitionDuration: 'var(--design-motion-slow)',
      width: '96px',
    });
    expect(screen.getByText('이벤트 내용')).toBeVisible();
  });

  it('controlled value와 잘못된 value에서 indicator 상태를 동기화한다', () => {
    mockTriggerMeasurements();
    const { rerender } = render(<Tabs items={items} value="status" />);
    const indicator = document.querySelector('[data-tabs-indicator]');

    expect(indicator).toHaveStyle({ opacity: '1', width: '80px' });

    rerender(<Tabs items={items} value="events" />);
    expect(indicator).toHaveStyle({
      opacity: '1',
      transform: 'translateX(84px)',
      transitionDuration: 'var(--design-motion-slow)',
      width: '96px',
    });

    rerender(<Tabs items={items} value="missing" />);
    expect(indicator).toHaveStyle({ opacity: '0', width: '0px' });

    rerender(<Tabs items={[]} value="missing" />);
    expect(indicator).toHaveStyle({ opacity: '0', width: '0px' });
  });
});
