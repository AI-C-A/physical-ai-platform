import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import { Icon } from '@/shared/ui/icon';

interface SheetProps {
  readonly children: ReactNode;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly title: string;
  readonly trigger: ReactNode;
}

export function Sheet({ children, onOpenChange, open, title, trigger }: SheetProps) {
  return (
    <Dialog.Root
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(open === undefined ? {} : { open })}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] border-r border-neutral-300 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="font-bold text-neutral-950">{title}</Dialog.Title>
            <Dialog.Close className="rounded p-2 text-sm hover:bg-neutral-100" aria-label="메뉴 닫기">
              <Icon name="close" />
            </Dialog.Close>
          </div>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
