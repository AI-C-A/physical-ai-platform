import type { ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';

interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly density?: 'compact' | 'normal';
  readonly description?: string;
  readonly eyebrow?: string;
  readonly title: string;
}

export function PageHeader({
  actions,
  className,
  density = 'compact',
  description,
  eyebrow,
  title,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div>
        {eyebrow === undefined ? null : <p className="text-xs font-bold tracking-wide text-muted uppercase">{eyebrow}</p>}
        <h1 className={cn(
          'mt-1 font-bold text-foreground',
          density === 'compact' ? 'text-2xl' : 'text-2xl sm:text-3xl',
        )}>{title}</h1>
        {description === undefined ? null : <p className="mt-1.5 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
