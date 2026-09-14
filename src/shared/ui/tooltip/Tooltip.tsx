import { useState, type PropsWithChildren, type ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

export function TooltipProvider({ children }: PropsWithChildren) {
  return <TooltipPrimitive.Provider delayDuration={400}>{children}</TooltipPrimitive.Provider>;
}

interface TooltipProps {
  readonly content: ReactNode;
  readonly disabled?: boolean;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly trigger: ReactNode;
}

export function Tooltip({ content, disabled = false, side = 'top', trigger }: TooltipProps) {
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
          className={`${getFloatingSurfaceClassName()} design-motion-tooltip z-50 max-w-64 rounded-[var(--design-radius-control)] px-2.5 py-1.5 text-[13px] text-foreground`}
          sideOffset={6}
          side={side}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-layer-floating" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
