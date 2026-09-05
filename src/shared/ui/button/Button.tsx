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
      <span
        className={`inline-flex w-full items-center gap-2 transition-opacity duration-[var(--design-motion-fast)] motion-reduce:transition-none ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        data-button-content
        style={{ gap: 'inherit', justifyContent: 'inherit' }}
      >
        {children}
      </span>
      {isLoading ? (
        <span
          aria-hidden="true"
          className="design-motion-button-loader pointer-events-none absolute inset-0 grid place-items-center"
          data-button-loader
        >
          <Spinner />
        </span>
      ) : null}
    </button>
  );
}
