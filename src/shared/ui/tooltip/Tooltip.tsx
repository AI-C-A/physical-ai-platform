import { useState, type PropsWithChildren, type ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

export function TooltipProvider({ children }: PropsWithChildren) {
  return <TooltipPrimitive.Provider delayDuration={400}>{children}</TooltipPrimitive.Provider>;
}

interface TooltipProps {
  readonly content: ReactNode;
  readonly disabled?: boolean;
  readonly trigger: ReactNode;
}

export function Tooltip({ content, disabled = false, trigger }: TooltipProps) {
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);

  return (
    <TooltipPrimitive.Root
      onOpenChange={(nextOpen) => setOpen(!disabled && nextOpen)}
      open={!disabled && open}
    >
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
