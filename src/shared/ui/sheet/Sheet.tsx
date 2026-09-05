import type { ComponentProps, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import { cn } from '@/shared/ui/class-names';
import { Icon } from '@/shared/ui/icon';
import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

interface SheetProps {
  readonly children: ReactNode;
  readonly onCloseAutoFocus?: ComponentProps<typeof Dialog.Content>['onCloseAutoFocus'];
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly title: string;
  readonly trigger: ReactNode;
}

export function Sheet({ children, onCloseAutoFocus, onOpenChange, open, title, trigger }: SheetProps) {
  return (
    <Dialog.Root
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(open === undefined ? {} : { open })}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="design-motion-overlay fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'design-motion-sheet fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col border-0 p-4 text-foreground',
            getFloatingSurfaceClassName('prominent'),
          )}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="font-bold text-foreground">{title}</Dialog.Title>
            <Dialog.Close className="rounded p-2 text-sm hover:bg-action-secondary-hover" aria-label="메뉴 닫기">
              <Icon name="close" />
            </Dialog.Close>
          </div>
          <div className="mt-5 min-h-0 flex-1">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
