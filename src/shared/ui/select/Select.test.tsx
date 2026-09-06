import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Select } from './Select';

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterAll(() => {
  if (scrollIntoViewDescriptor === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    return;
  }
  Object.defineProperty(
    HTMLElement.prototype,
    'scrollIntoView',
    scrollIntoViewDescriptor,
  );
});

describe('Select', () => {
  it('시각적 라벨 없이도 leading icon과 접근 가능한 이름을 표시한다', () => {
    render(
      <Select
        label="사이트"
        leadingIcon="location"
        onValueChange={vi.fn()}
        options={[{ label: '판교', value: 'pangyo' }]}
        showLabel={false}
        value="pangyo"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: '사이트' });
    expect(trigger).toHaveTextContent('판교');
    expect(trigger.querySelector('.lucide-map-pin')).toBeInTheDocument();
    expect(screen.queryByText('사이트')).not.toBeInTheDocument();
  });

  it('닫힌 trigger와 열린 선택 목록에 각각 접근 가능한 이름을 제공한다', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        label="로봇"
        onValueChange={onValueChange}
        options={[
          { label: '정찰 로봇 01', value: 'robot-001' },
          { label: '수송 로봇 02', value: 'robot-002' },
        ]}
        value="robot-001"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: '로봇' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox', { name: '로봇 선택' })).toHaveClass(
      'bg-layer-floating',
      'shadow-lg',
      'backdrop-blur-[var(--design-backdrop-blur-floating)]',
    );
  });

  it('overlay와 큰 조작 영역을 선택해도 열린 메뉴는 공통 표면을 유지한다', async () => {
    const user = userEvent.setup();
    render(
      <Select
        surface="overlay"
        controlSize="large"
        label="사이트"
        onValueChange={vi.fn()}
        options={[{ label: '판교', value: 'pangyo' }]}
        value="pangyo"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: '사이트' });
    expect(trigger).toHaveAttribute('data-surface', 'overlay');
    expect(trigger).toHaveClass('min-h-[var(--layout-control-height-large)]');
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox', { name: '사이트 선택' })).toHaveClass(
      'ui-menu-surface',
      'bg-layer-floating',
      'shadow-lg',
      'backdrop-blur-[var(--design-backdrop-blur-floating)]',
    );
    expect(screen.getByRole('option', { name: '판교' })).toHaveClass(
      'ui-menu-item',
    );
  });
});
