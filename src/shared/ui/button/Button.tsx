import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';
import { Spinner } from '@/shared/ui/spinner';

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly children: ReactNode;
  readonly isLoading?: boolean;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export function Button({
  children,
  className,
  disabled = false,
  isLoading = false,
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      aria-busy={isLoading}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700 active:bg-neutral-950',
        variant === 'secondary' &&
          'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200',
        variant === 'danger' &&
          'border-red-800 bg-red-800 text-white hover:bg-red-700',
        className,
      )}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="sr-only">{children}</span>
          <Spinner />
        </>
      ) : children}
    </button>
  );
}
