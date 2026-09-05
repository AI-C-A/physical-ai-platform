import type { ReactNode } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

import { cn } from '@/shared/ui/class-names';
import { Icon } from '@/shared/ui/icon';

interface CheckboxProps {
  readonly checked: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly indicatorPosition?: 'start' | 'end';
  readonly label: ReactNode;
  readonly onCheckedChange: (checked: boolean) => void;
}

export function Checkbox({
  checked,
  className,
  disabled = false,
  indicatorPosition = 'start',
  label,
  onCheckedChange,
}: CheckboxProps) {
  return (
    <label className={cn(
      'flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
      indicatorPosition === 'end' ? 'flex-row-reverse' : undefined,
      className,
    )}>
      <CheckboxPrimitive.Root
        checked={checked}
        className="grid size-5 transform-gpu place-items-center rounded border border-border bg-surface transition-[background-color,border-color,color,transform] active:scale-[0.96] motion-reduce:active:scale-100 disabled:active:scale-100 data-[state=checked]:border-action-primary data-[state=checked]:bg-action-primary data-[state=checked]:text-action-on-fill"
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      >
        <CheckboxPrimitive.Indicator
          aria-hidden="true"
          className="grid scale-75 place-items-center opacity-0 transition-[opacity,transform] duration-[var(--design-motion-fast)] ease-[var(--design-ease-enter)] motion-reduce:transition-none data-[state=checked]:scale-100 data-[state=checked]:opacity-100"
          forceMount
        >
          <Icon name="check" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label}
    </label>
  );
}
