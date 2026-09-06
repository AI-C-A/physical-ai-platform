import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('press와 indicator 선택 전환을 제공하면서 callback 계약을 유지한다', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Checkbox
        checked={false}
        label="자동 순찰"
        onCheckedChange={onCheckedChange}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: '자동 순찰' });
    const indicator = checkbox.querySelector('[data-state="unchecked"]');

    expect(checkbox).toHaveClass(
      'ui-pressable',
      'ui-pressable--compact',
    );
    expect(indicator).toHaveClass(
      'scale-75',
      'opacity-0',
      'data-[state=checked]:scale-100',
      'data-[state=checked]:opacity-100',
    );

    await user.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    rerender(
      <Checkbox
        checked
        label="자동 순찰"
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(checkbox.querySelector('[data-state="checked"]')).toBeInTheDocument();
  });
});
