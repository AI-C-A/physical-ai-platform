import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';

export interface OperationalStripItem {
  readonly detail: ReactNode;
  readonly label: string;
  readonly value: ReactNode;
}

interface OperationalStripProps extends HTMLAttributes<HTMLElement> {
  readonly columns?: 3 | 4;
  readonly items: readonly OperationalStripItem[];
  readonly variant?: 'shell' | 'surface';
}

export function OperationalStrip({
  className,
  columns = 4,
  items,
  variant = 'surface',
  ...props
}: OperationalStripProps) {
  return (
    <section
      className={cn(
        variant === 'shell'
          ? 'shrink-0 border-y border-border bg-layer-base px-3 sm:px-4'
          : 'rounded-[var(--design-radius-surface)] bg-layer-raised',
        className,
      )}
      {...props}
    >
      <dl className={cn(
        'grid divide-y divide-border',
        columns === 3
          ? 'grid-cols-1 sm:grid-cols-3 sm:divide-x sm:divide-y-0'
          : 'grid-cols-2 divide-x lg:grid-cols-4 lg:divide-y-0',
      )}>
        {items.map((item) => (
          <div className="min-w-0 px-3 py-2.5 lg:px-4" key={item.label}>
            <dt className="text-xs leading-4 text-muted">{item.label}</dt>
            <dd className="mt-1 truncate text-sm font-semibold leading-5 tabular-nums text-foreground">{item.value}</dd>
            <dd className="mt-0.5 truncate text-xs leading-4 text-muted">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
