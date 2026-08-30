import type { ComponentProps, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { Button } from '@/shared/ui/button';

interface DialogProps {
  readonly children: ReactNode;
  readonly description?: string;
  readonly onCloseAutoFocus?: ComponentProps<
    typeof DialogPrimitive.Content
  >['onCloseAutoFocus'];
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly title: string;
  readonly trigger?: ReactNode;
}

export function Dialog({
  children,
  description,
  onCloseAutoFocus,
  onOpenChange,
  open,
  title,
  trigger,
}: DialogProps) {
  return (
    <DialogPrimitive.Root
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(open === undefined ? {} : { open })}
    >
      {trigger === undefined ? null : (
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      )}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[var(--design-radius-surface)] border-0 bg-layer-floating p-6 text-foreground shadow-xl"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DialogPrimitive.Title className="text-lg font-bold text-foreground">
            {title}
          </DialogPrimitive.Title>
          {description === undefined ? null : (
            <DialogPrimitive.Description className="mt-2 text-sm text-muted">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="mt-5">{children}</div>
          <DialogPrimitive.Close asChild>
            <Button className="mt-5" variant="secondary">
              닫기
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
