import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';

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
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={label} asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          className={`z-50 rounded-[var(--design-radius-control)] border-0 bg-layer-floating p-1 text-foreground shadow-lg ${matchTriggerWidth ? 'w-[var(--radix-dropdown-menu-trigger-width)]' : 'min-w-48'}`}
          side={side}
          sideOffset={6}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              className="flex cursor-default items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none data-[highlighted]:bg-action-secondary-hover data-[disabled]:opacity-50"
              {...(item.selected ? { 'aria-current': 'page' } : {})}
              {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
              key={item.label}
              onSelect={item.onSelect}
            >
              {item.icon}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.selected ? (
                <Check aria-hidden="true" className="shrink-0" size={16} />
              ) : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
