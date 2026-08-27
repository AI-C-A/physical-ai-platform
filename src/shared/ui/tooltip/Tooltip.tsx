import type { PropsWithChildren, ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

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
        <TooltipPrimitive.Content className="z-50 max-w-64 rounded bg-neutral-950 px-2 py-1 text-xs text-white shadow" sideOffset={6}>
          {content}
          <TooltipPrimitive.Arrow className="fill-neutral-950" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
