import { useId, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/shared/ui/class-names';
import { getFieldClassName } from '@/shared/ui/input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label: string;
  readonly error?: string;
}

export function Textarea({
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  className,
  error,
  id,
  label,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = `${textareaId}-error`;
  return (
    <div className="ui-field-group grid gap-1.5 text-sm font-medium">
      <label className="ui-field-label" htmlFor={textareaId}>{label}</label>
      <textarea
        aria-describedby={[describedBy, error === undefined ? undefined : errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error === undefined ? invalid : true}
        className={cn(getFieldClassName('default', 'default'), 'min-h-24', className)}
        id={textareaId}
        {...props}
      />
      {error === undefined ? null : <span className="font-normal text-negative" id={errorId}>{error}</span>}
    </div>
  );
}
