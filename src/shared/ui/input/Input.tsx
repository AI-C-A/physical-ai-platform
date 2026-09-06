import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

import { cn } from '@/shared/ui/class-names';
import { Icon, type IconName } from '@/shared/ui/icon';
import { getFieldClassName, type FieldSize, type FieldSurface } from './field-styles';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly leadingIcon?: IconName;
  readonly controlSize?: FieldSize;
  readonly surface?: FieldSurface;
  readonly endAdornment?: ReactNode;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly label: string;
  readonly error?: string;
  readonly showLabel?: boolean;
}

export function Input({
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  className,
  controlSize = 'default',
  surface = 'default',
  endAdornment,
  error,
  id,
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
    <div className={cn('ui-field-group grid gap-1.5 text-sm font-medium', className)}>
      <label className={cn('ui-field-label', !showLabel && 'sr-only')} htmlFor={inputId}>{label}</label>
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
            getFieldClassName(controlSize, surface),
            leadingIcon === undefined ? undefined : 'pl-9',
            endAdornment && 'pr-11',
          )}
          data-surface={surface}
          id={inputId}
          ref={inputRef}
          {...props}
        />
        {endAdornment ? <span className="absolute inset-y-0 right-1 flex items-center">{endAdornment}</span> : null}
      </span>
      {error === undefined ? null : (
        <span className="font-normal text-negative" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
