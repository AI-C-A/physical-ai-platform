import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  readonly contentClassName?: string;
  readonly title?: string;
  readonly description?: string;
}

export function Panel({
  children,
  className,
  contentClassName,
  description,
  title,
  ...props
}: PanelProps) {
  return (
    <section className={cn('rounded-xl border border-neutral-200 bg-white p-5 shadow-sm', className)} {...props}>
      {title === undefined ? null : <h2 className="text-base font-bold text-neutral-950">{title}</h2>}
      {description === undefined ? null : <p className="mt-1 text-sm text-neutral-600">{description}</p>}
      <div
        className={cn(
          title === undefined && description === undefined ? undefined : 'mt-4',
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
