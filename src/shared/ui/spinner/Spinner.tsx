import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/ui/class-names';

interface SpinnerProps extends ComponentProps<'svg'> {
  readonly label?: string;
}

export function Spinner({ className, label, ...props }: SpinnerProps) {
  return (
    <LoaderCircle
      aria-hidden={label === undefined}
      aria-label={label}
      className={cn('size-4 animate-spin', className)}
      role={label === undefined ? undefined : 'status'}
      {...props}
    />
  );
}
