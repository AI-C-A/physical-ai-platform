import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';
import { Surface, type SurfaceLayer } from '@/shared/ui/surface';

interface DetailPaneProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  readonly description?: string;
  readonly layer?: SurfaceLayer;
  readonly title?: string;
}

export function DetailPane({
  children,
  className,
  description,
  layer = 'raised',
  title,
  ...props
}: DetailPaneProps) {
  return (
    <Surface
      className={cn('grid gap-4', className)}
      density="compact"
      layer={layer}
      {...props}
    >
      {title === undefined && description === undefined ? null : (
        <header className="grid gap-1">
          {title === undefined ? null : (
            <h2 className="text-base font-bold text-foreground">{title}</h2>
          )}
          {description === undefined ? null : (
            <p className="text-sm text-muted">{description}</p>
          )}
        </header>
      )}
      {children}
    </Surface>
  );
}
