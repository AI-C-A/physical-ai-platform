import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';
import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

export type ColorScheme = 'light' | 'dark';
export type ColorLayer = 'canvas' | 'base' | 'raised' | 'floating';

interface ColorSchemeAreaProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly layer?: ColorLayer;
  readonly scheme?: ColorScheme;
}

export function ColorSchemeArea({
  children,
  className,
  layer = 'base',
  scheme,
  ...props
}: ColorSchemeAreaProps) {
  return (
    <div
      className={cn(
        'text-foreground',
        className,
        layer === 'floating' ? getFloatingSurfaceClassName() : undefined,
      )}
      data-color-layer={layer}
      data-color-scheme={scheme}
      {...props}
    >
      {children}
    </div>
  );
}
