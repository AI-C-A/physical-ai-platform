import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/ui/class-names';
import { Surface } from '@/shared/ui/surface';

interface StatTileProps extends HTMLAttributes<HTMLElement> {
  readonly emphasis?: 'primary' | 'secondary';
  readonly label: string;
  readonly value: ReactNode;
}

export function StatTile({
  className,
  emphasis = 'secondary',
  label,
  value,
  ...props
}: StatTileProps) {
  return (
    <Surface
      as="article"
      className={cn(
        emphasis === 'primary' ? 'bg-action-secondary-active' : undefined,
        className,
      )}
      density="compact"
      {...props}
    >
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          'mt-2 font-bold text-foreground',
          emphasis === 'primary' ? 'text-3xl' : 'text-2xl',
        )}
      >
        {value}
      </p>
    </Surface>
  );
}
