import { useId, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { readonly label: string }

export function Textarea({ id, label, ...props }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  return <label className="grid gap-1.5 text-sm font-medium text-foreground" htmlFor={textareaId}>{label}<textarea className="min-h-24 rounded-[var(--design-radius-control)] border border-border bg-layer-base px-3 py-2 font-normal text-foreground disabled:bg-surface-muted" id={textareaId} {...props} /></label>;
}
