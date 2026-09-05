import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';
import { Surface, type SurfaceDensity, type SurfaceLayer } from '@/shared/ui/surface';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  readonly contentClassName?: string;
  readonly title?: string;
  readonly description?: string;
  readonly density?: SurfaceDensity;
  readonly layer?: SurfaceLayer;
}

export function Panel({
  children,
  className,
  contentClassName,
  description,
  density = 'normal',
  layer = 'raised',
  title,
  ...props
}: PanelProps) {
  return (
    <Surface
      className={cn('min-w-0', className)}
      density={density}
      layer={layer}
      {...props}
    >
      {title === undefined ? null : <h2 className="text-base font-bold text-foreground">{title}</h2>}
      {description === undefined ? null : <p className="mt-1 text-sm text-muted">{description}</p>}
      <div
        className={cn(
          title === undefined && description === undefined ? undefined : 'mt-4',
          contentClassName,
        )}
      >
        {children}
      </div>
    </Surface>
  );
}
