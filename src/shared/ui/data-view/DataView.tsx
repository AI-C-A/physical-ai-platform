import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';
import { ErrorMessage } from '@/shared/ui/error-message';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Surface } from '@/shared/ui/surface';

type DataViewState = 'empty' | 'error' | 'loading' | 'ready';

interface DataViewProps extends HTMLAttributes<HTMLElement> {
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
  readonly message?: string;
  readonly onRetry?: () => void;
  readonly state?: DataViewState;
}

export function DataView({
  children,
  className,
  footer,
  message,
  onRetry,
  state = 'ready',
  ...props
}: DataViewProps) {
  const feedback = state === 'loading'
    ? <QueryFeedback kind="loading" />
    : state === 'empty'
      ? <QueryFeedback kind="empty" message={message ?? '표시할 데이터가 없습니다.'} />
      : state === 'error'
        ? onRetry === undefined
          ? <ErrorMessage>{message ?? '데이터를 불러오지 못했습니다.'}</ErrorMessage>
          : <QueryFeedback kind="error" message={message ?? '데이터를 불러오지 못했습니다.'} onRetry={onRetry} />
        : children;

  return (
    <Surface className={cn('grid gap-4 overflow-hidden p-0', className)} {...props}>
      {feedback}
      {footer === undefined ? null : <div className="px-4 pb-4">{footer}</div>}
    </Surface>
  );
}
