import type { ComponentProps } from 'react';

import { cn } from '@/shared/ui/class-names';

type ErrorMessageProps = Omit<ComponentProps<'p'>, 'role'>;

export function ErrorMessage({ className, ...props }: ErrorMessageProps) {
  return (
    <p
      className={cn('rounded-md bg-red-50 px-3 py-2 text-sm text-red-900', className)}
      role="alert"
      {...props}
    />
  );
}
