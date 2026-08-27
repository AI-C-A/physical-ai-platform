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

    expect(
      screen.getByRole('listbox', { name: '로봇 선택' }),
    ).toBeInTheDocument();
  });
});
