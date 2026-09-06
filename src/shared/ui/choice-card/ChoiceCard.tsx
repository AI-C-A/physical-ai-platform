import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';
import { Icon } from '@/shared/ui/icon';

interface ChoiceCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly selected: boolean;
  readonly density?: 'compact' | 'normal';
  readonly trailing?: ReactNode;
}

export function ChoiceCard({ title, description, selected, density = 'normal', trailing, children, className, ...props }: ChoiceCardProps) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      className={cn('ui-pressable ui-pressable--surface ui-choice grid w-full gap-3 rounded-[var(--design-radius-surface)] text-left', density === 'compact' ? 'p-4' : 'p-5', className)}
    >
      <span className="flex items-center justify-between gap-3">
        <strong>{title}</strong>
        <span className="flex items-center gap-2">
          {trailing}
          <span aria-hidden="true" className={selected ? 'text-selection-border' : 'invisible'}><Icon name="check" /></span>
        </span>
      </span>
      {description ? <span className="text-sm text-muted">{description}</span> : null}
      {children}
    </button>
  );
}
