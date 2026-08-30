import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';

export type PageFrameLayout =
  | 'standard'
  | 'wide'
  | 'focused'
  | 'full-bleed'
  | 'immersive';

interface PageFrameProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly layout?: PageFrameLayout;
}

const layoutClassNames: Record<PageFrameLayout, string> = {
  standard: 'grid w-full gap-[var(--layout-section-gap)]',
  wide: 'grid w-full gap-[var(--layout-section-gap)]',
  focused:
    'mx-auto grid w-full max-w-[var(--layout-focused-width)] gap-[var(--layout-section-gap)]',
  'full-bleed': 'min-h-0 w-full',
  immersive: 'min-h-dvh w-full',
};

export function PageFrame({
  children,
  className,
  layout = 'standard',
  ...props
}: PageFrameProps) {
  return (
    <div
      className={cn(layoutClassNames[layout], className)}
      data-page-frame={layout}
      {...props}
    >
      {children}
    </div>
  );
}
