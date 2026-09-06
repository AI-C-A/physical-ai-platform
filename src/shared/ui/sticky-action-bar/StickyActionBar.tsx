import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';

interface StickyActionBarProps extends HTMLAttributes<HTMLElement> {
  readonly appearance?: 'raised' | 'plain';
  readonly children: ReactNode;
  readonly position?: 'contained' | 'responsive-pane' | 'viewport';
}

export function StickyActionBar({
  appearance = 'raised',
  children,
  className,
  position = 'contained',
  ...props
}: StickyActionBarProps) {
  return (
    <section
      className={cn(
        'z-30 px-4 py-3',
        appearance === 'plain' ? 'border-0 bg-transparent' : 'border-t border-border bg-layer-raised',
        position === 'viewport'
          ? 'fixed inset-x-0 bottom-0 min-h-20 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6'
          : position === 'responsive-pane'
            ? 'fixed inset-x-0 bottom-0 min-h-20 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 lg:static lg:min-h-0 lg:pb-3'
            : 'shrink-0 sm:px-6',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
