import type { PropsWithChildren, ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

export function TooltipProvider({ children }: PropsWithChildren) {
  return <TooltipPrimitive.Provider delayDuration={400}>{children}</TooltipPrimitive.Provider>;
}

interface TooltipProps {
  readonly content: ReactNode;
  readonly trigger: ReactNode;
}

export function Tooltip({ content, trigger }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className={`${getFloatingSurfaceClassName()} design-motion-tooltip z-50 max-w-64 rounded-[var(--design-radius-control)] px-2 py-1 text-xs text-foreground`}
          sideOffset={6}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-layer-floating" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
