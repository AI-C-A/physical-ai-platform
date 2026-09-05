import type { HTMLAttributes } from 'react';

import { cn } from '@/shared/ui/class-names';

export type StatusIndicatorTone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info';

interface StatusIndicatorProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  readonly label: string;
  readonly pulse?: boolean;
  readonly tone?: StatusIndicatorTone;
}

const toneClassNames: Readonly<Record<StatusIndicatorTone, string>> = {
  neutral: 'text-status-neutral-foreground',
  positive: 'text-status-positive-foreground',
  warning: 'text-status-warning-foreground',
  negative: 'text-status-negative-foreground',
  info: 'text-status-info-foreground',
};

const dotClassNames: Readonly<Record<StatusIndicatorTone, string>> = {
  neutral: 'bg-status-neutral-foreground',
  positive: 'bg-status-positive-foreground',
  warning: 'bg-status-warning-foreground',
  negative: 'bg-status-negative-foreground',
  info: 'bg-status-info-foreground',
};

export function StatusIndicator({
  className,
  label,
  pulse = false,
  tone = 'neutral',
  ...props
}: StatusIndicatorProps) {
  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-2 text-sm font-semibold', toneClassNames[tone], className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-[var(--design-radius-round)]',
          dotClassNames[tone],
          pulse ? 'motion-safe:animate-pulse' : undefined,
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
