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
      className={cn('size-4 motion-safe:animate-spin motion-reduce:animate-none', className)}
      role={label === undefined ? undefined : 'status'}
      {...props}
    />
  );
}
