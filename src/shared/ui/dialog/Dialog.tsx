import type { ComponentProps, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/ui/class-names';
import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

interface DialogProps {
  readonly actions?: ReactNode;
  readonly cancelLabel?: string;
  readonly children?: ReactNode;
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
  actions,
  cancelLabel,
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
        <DialogPrimitive.Overlay className="design-motion-overlay fixed inset-0 z-40 bg-overlay" />
        <DialogPrimitive.Content
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          className={cn(
            'design-motion-dialog fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[var(--design-radius-surface)] border border-border p-6 text-foreground',
            getFloatingSurfaceClassName('prominent'),
          )}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DialogPrimitive.Title className="break-keep text-lg font-bold leading-6 text-foreground">
            {title}
          </DialogPrimitive.Title>
          {description === undefined ? null : (
            <DialogPrimitive.Description className="mt-2 break-keep text-sm leading-6 text-muted">
              {description}
            </DialogPrimitive.Description>
          )}
          {children === undefined || children === null ? null : (
            <div className="mt-5">{children}</div>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild>
              <Button variant="secondary">
                {cancelLabel ?? (actions === undefined ? '닫기' : '취소')}
              </Button>
            </DialogPrimitive.Close>
            {actions}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
