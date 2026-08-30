import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';
import { Surface } from '@/shared/ui/surface';

interface PageToolbarProps extends HTMLAttributes<HTMLElement> {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

export function PageToolbar({
  actions,
  children,
  className,
  ...props
}: PageToolbarProps) {
  return (
    <Surface
      className={cn('grid gap-[var(--layout-toolbar-gap)]', className)}
      density="compact"
      layer="raised"
      {...props}
    >
      <div className="grid gap-[var(--layout-toolbar-gap)] md:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      )}
    </Surface>
  );
}
