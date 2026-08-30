import type { HTMLAttributes, TableHTMLAttributes } from 'react';

import { cn } from '@/shared/ui/class-names';

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  readonly containerClassName?: string;
  readonly density?: 'compact' | 'normal';
}

export function Table({
  containerClassName,
  density = 'compact',
  ...props
}: TableProps) {
  const ariaLabel = props['aria-label'];
  return (
    <div
      aria-label={`${ariaLabel ?? '표'} 가로 스크롤 영역`}
      className={cn(
        'w-full overflow-x-auto rounded-[var(--design-radius-surface)] border-0 bg-layer-raised text-foreground shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        containerClassName,
      )}
      data-density={density}
      role="region"
      tabIndex={0}
    >
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  );
}

export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-surface-muted/70 text-muted" {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-border" {...props} />;
}

export function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className="hover:bg-surface-muted" {...props} />;
}

export function TableHead(props: HTMLAttributes<HTMLTableCellElement>) {
  return <th className="h-[var(--layout-data-row-height)] whitespace-nowrap px-4 py-2 font-semibold" scope="col" {...props} />;
}

export function TableCell(props: HTMLAttributes<HTMLTableCellElement>) {
  return <td className="h-[var(--layout-data-row-height)] whitespace-nowrap px-4 py-2 text-foreground" {...props} />;
}
