import type { HTMLAttributes, TableHTMLAttributes } from 'react';

export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  const ariaLabel = props['aria-label'];
  return (
    <div
      aria-label={`${ariaLabel ?? '표'} 가로 스크롤 영역`}
      className="w-full overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      role="region"
      tabIndex={0}
    >
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  );
}

export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-neutral-50 text-neutral-700" {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-neutral-200" {...props} />;
}

export function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className="hover:bg-neutral-50" {...props} />;
}

export function TableHead(props: HTMLAttributes<HTMLTableCellElement>) {
  return <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col" {...props} />;
}

export function TableCell(props: HTMLAttributes<HTMLTableCellElement>) {
  return <td className="whitespace-nowrap px-4 py-3 text-neutral-800" {...props} />;
}
