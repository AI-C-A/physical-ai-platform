import type { ReactNode } from 'react';
import * as Menu from './menu-parts';

export interface DropdownItem {
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: string;
  readonly onSelect: () => void;
  readonly selected?: boolean;
}

interface DropdownProps {
  readonly align?: 'start' | 'center' | 'end';
  readonly items: readonly DropdownItem[];
  readonly label: string;
  readonly matchTriggerWidth?: boolean;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly trigger: ReactNode;
}

export function Dropdown({
  align = 'end',
  items,
  label,
  matchTriggerWidth = false,
  side = 'bottom',
  trigger,
}: DropdownProps) {
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={label} asChild>{trigger}</Menu.Trigger>
      <Menu.Content
        align={align}
        width={matchTriggerWidth ? 'trigger' : 'content'}
        side={side}
      >
        {items.map((item) => (
          <Menu.Item
            label={item.label}
            icon={item.icon}
            {...(item.selected === undefined ? {} : { selected: item.selected })}
            {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
            key={item.label}
            onSelect={item.onSelect}
          />
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}
