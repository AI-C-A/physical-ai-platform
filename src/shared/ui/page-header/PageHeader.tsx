import type { ReactNode } from 'react';

interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly description?: string;
  readonly eyebrow?: string;
  readonly title: string;
}

export function PageHeader({ actions, description, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow === undefined ? null : <p className="text-xs font-bold tracking-wide text-neutral-500 uppercase">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold text-neutral-950 sm:text-3xl">{title}</h1>
        {description === undefined ? null : <p className="mt-2 max-w-3xl text-sm text-neutral-600">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
