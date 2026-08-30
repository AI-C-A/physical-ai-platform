import type { ReactNode } from 'react';

interface BadgeProps {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'info';
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  const tones = {
    neutral: 'border-transparent bg-status-neutral-background text-status-neutral-foreground',
    positive: 'border-transparent bg-status-positive-background text-status-positive-foreground',
    warning: 'border-transparent bg-status-warning-background text-status-warning-foreground',
    negative: 'border-transparent bg-status-negative-background text-status-negative-foreground',
    info: 'border-transparent bg-status-info-background text-status-info-foreground',
  } as const;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
