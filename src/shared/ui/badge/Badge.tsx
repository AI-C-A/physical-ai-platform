import type { ReactNode } from 'react';

interface BadgeProps {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'info';
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  const tones = {
    neutral: 'border-neutral-300 bg-neutral-100 text-neutral-700',
    positive: 'border-green-300 bg-green-50 text-green-800',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    negative: 'border-red-300 bg-red-50 text-red-900',
    info: 'border-blue-300 bg-blue-50 text-blue-900',
  } as const;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
