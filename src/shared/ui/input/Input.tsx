import { useId, type InputHTMLAttributes, type Ref } from 'react';

import { cn } from '@/shared/ui/class-names';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly label: string;
  readonly error?: string;
}

export function Input({ className, error, id, inputRef, label, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <label className={cn('grid gap-1.5 text-sm font-medium text-neutral-800', className)} htmlFor={inputId}>
      {label}
      <input
        aria-describedby={error === undefined ? undefined : errorId}
        aria-invalid={error === undefined ? undefined : true}
        className="min-h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-neutral-900 placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:bg-neutral-100"
        id={inputId}
        ref={inputRef}
        {...props}
      />
      {error === undefined ? null : (
        <span className="font-normal text-red-800" id={errorId}>
          {error}
        </span>
      )}
    </label>
  );
}
