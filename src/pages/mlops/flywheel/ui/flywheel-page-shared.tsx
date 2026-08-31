import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/shared/ui/badge';
import { getButtonClassName } from '@/shared/ui/button';
import { QueryFeedback } from '@/shared/ui/query-feedback';

export function StatusBadge({ status }: { readonly status: string }) {
  const positive = ['completed', 'passed', 'released', 'succeeded', 'active', 'production', 'approved', 'ready'];
  const negative = ['failed', 'rejected', 'invalid', 'cancelled', 'error', 'rolled-back'];
  const warning = ['needs-review', 'quarantined', 'partial', 'rolling-back', 'detected'];
  const tone = positive.includes(status)
    ? 'positive'
    : negative.includes(status)
      ? 'negative'
      : warning.includes(status)
        ? 'warning'
        : 'info';
  return <Badge tone={tone}>{status}</Badge>;
}

export function DetailLink({ children, to }: { readonly children: ReactNode; readonly to: string }) {
  return <Link className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground" to={to}>{children}</Link>;
}

export function ActionLink({ children, to }: { readonly children: ReactNode; readonly to: string }) {
  return <Link className={getButtonClassName('primary')} to={to}>{children}</Link>;
}

export function JsonExportButton({
  fileName,
  label,
  records,
}: {
  readonly fileName: string;
  readonly label: string;
  readonly records: unknown;
}) {
  function download(): void {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <button className={getButtonClassName('secondary')} onClick={download} type="button">{label}</button>;
}

export function AsyncState<T>({
  query,
  children,
  emptyMessage = '표시할 데이터가 없습니다.',
}: {
  readonly query: {
    readonly status: 'loading' | 'error' | 'ready';
    readonly data?: T;
    readonly message?: string;
    readonly retry: () => void;
  };
  readonly children: (data: NonNullable<T>) => ReactNode;
  readonly emptyMessage?: string;
}) {
  if (query.status === 'loading') return <QueryFeedback kind="loading" />;
  if (query.status === 'error') return <QueryFeedback kind="error" message="데이터를 불러오지 못했습니다." onRetry={query.retry} />;
  if (query.data === undefined || query.data === null || (Array.isArray(query.data) && query.data.length === 0)) {
    return <QueryFeedback kind="empty" message={emptyMessage} />;
  }
  return children(query.data);
}

export function DefinitionGrid({ items }: { readonly items: readonly { readonly label: string; readonly value: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div className="rounded-[var(--design-radius-control)] bg-layer-base p-3" key={item.label}>
          <dt className="text-xs font-semibold text-muted">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
