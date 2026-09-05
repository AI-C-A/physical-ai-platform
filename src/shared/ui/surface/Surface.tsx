import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';

import { getFloatingSurfaceClassName } from './floating-surface';

export type SurfaceDensity = 'compact' | 'normal';
export type SurfaceLayer =
  | 'canvas'
  | 'base'
  | 'raised'
  | 'floating'
  | 'translucent'
  | 'soft-group';

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  readonly as?: 'article' | 'aside' | 'div' | 'figure' | 'header' | 'section';
  readonly children: ReactNode;
  readonly density?: SurfaceDensity;
  readonly layer?: SurfaceLayer;
}

const layerClassNames: Record<SurfaceLayer, string> = {
  canvas: 'bg-layer-canvas',
  base: 'bg-layer-base',
  raised: 'bg-layer-raised',
  floating: getFloatingSurfaceClassName(),
  translucent: 'bg-surface-muted/[0.88] shadow-xl backdrop-blur-xl',
  'soft-group': 'rounded-[var(--design-radius-soft-group)] border-0 bg-foreground/[0.04] shadow-none',
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
        layer === 'floating' ? undefined : layerClassNames[layer],
        densityClassNames[density],
        className,
        layer === 'floating' ? layerClassNames[layer] : undefined,
      )}
      data-surface-layer={layer}
      {...props}
    >
      {children}
    </Component>
  );
}
