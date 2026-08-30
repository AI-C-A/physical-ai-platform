import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';

export type SurfaceDensity = 'compact' | 'normal';
export type SurfaceLayer = 'base' | 'raised' | 'floating' | 'translucent';

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  readonly as?: 'article' | 'aside' | 'div' | 'header' | 'section';
  readonly children: ReactNode;
  readonly density?: SurfaceDensity;
  readonly layer?: SurfaceLayer;
}

const layerClassNames: Record<SurfaceLayer, string> = {
  base: 'bg-layer-base',
  raised: 'bg-layer-raised',
  floating: 'bg-layer-floating shadow-lg',
  translucent: 'bg-surface-muted/[0.88] shadow-xl backdrop-blur-xl',
};

const densityClassNames: Record<SurfaceDensity, string> = {
  compact: 'p-[var(--layout-surface-padding-compact)]',
  normal: 'p-[var(--layout-surface-padding-normal)]',
};

export function Surface({
  as: Component = 'section',
  children,
  className,
  density = 'normal',
  layer = 'raised',
  ...props
}: SurfaceProps) {
  return (
    <Component
      className={cn(
        'rounded-[var(--design-radius-surface)] border-0 text-foreground',
        layerClassNames[layer],
        densityClassNames[density],
        className,
      )}
      data-surface-layer={layer}
      {...props}
    >
      {children}
    </Component>
  );
}
