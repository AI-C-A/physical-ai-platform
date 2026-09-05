import { useId, type InputHTMLAttributes, type Ref } from 'react';

import { cn } from '@/shared/ui/class-names';
import { Icon, type IconName } from '@/shared/ui/icon';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly leadingIcon?: IconName;
  readonly inputClassName?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly label: string;
  readonly error?: string;
  readonly showLabel?: boolean;
}

export function Input({
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  className,
  error,
  id,
  inputClassName,
  inputRef,
  label,
  leadingIcon,
  showLabel = true,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className={cn('grid gap-1.5 text-sm font-medium text-foreground', className)}>
      <label className={showLabel ? undefined : 'sr-only'} htmlFor={inputId}>{label}</label>
      <span className="relative">
        {leadingIcon === undefined ? null : (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-muted"
          >
            <Icon name={leadingIcon} />
          </span>
        )}
        <input
          aria-describedby={[describedBy, error === undefined ? undefined : errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error === undefined ? invalid : true}
          className={cn(
            'min-h-[var(--layout-control-height)] w-full rounded-[var(--design-radius-control)] border border-border bg-layer-base px-3 py-2 font-normal text-foreground placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-muted',
            leadingIcon === undefined ? undefined : 'pl-9',
            inputClassName,
          )}
          id={inputId}
          ref={inputRef}
          {...props}
        />
      </span>
      {error === undefined ? null : (
        <span className="font-normal text-negative" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
