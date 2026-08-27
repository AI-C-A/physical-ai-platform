import { useId, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { readonly label: string }

export function Textarea({ id, label, ...props }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  return <label className="grid gap-1.5 text-sm font-medium text-neutral-800" htmlFor={textareaId}>{label}<textarea className="min-h-24 rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-neutral-900 disabled:bg-neutral-100" id={textareaId} {...props} /></label>;
}
