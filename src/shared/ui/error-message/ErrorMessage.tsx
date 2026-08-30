import type { ComponentProps } from 'react';

import { cn } from '@/shared/ui/class-names';

type ErrorMessageProps = Omit<ComponentProps<'p'>, 'role'>;

export function ErrorMessage({ className, ...props }: ErrorMessageProps) {
  return (
    <p
      className={cn('rounded-md bg-status-negative-background px-3 py-2 text-sm text-status-negative-foreground', className)}
      role="alert"
      {...props}
    />
  );
}
