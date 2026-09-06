import { useId, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';

interface TableSectionProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  readonly title: string;
}

export function TableSection({ children, className, title, ...props }: TableSectionProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn('grid min-w-0 gap-[var(--layout-toolbar-gap)]', className)}
      {...props}
    >
      <h2 className="text-base font-bold text-foreground" id={titleId}>{title}</h2>
      {children}
    </section>
  );
}
