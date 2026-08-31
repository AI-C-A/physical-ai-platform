import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

import { Spinner } from '@/shared/ui/spinner';

import { getButtonClassName, type ButtonVariant } from './button-styles';

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly buttonRef?: Ref<HTMLButtonElement>;
  readonly children: ReactNode;
  readonly isLoading?: boolean;
  readonly variant?: ButtonVariant;
}

export function Button({
  buttonRef,
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
      className={getButtonClassName(variant, className)}
      disabled={disabled || isLoading}
      ref={buttonRef}
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
