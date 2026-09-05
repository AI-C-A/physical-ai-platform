import type { HTMLAttributes, ReactNode } from 'react';
import './media-panel.css';

import { cn } from '@/shared/ui/class-names';
import { Surface } from '@/shared/ui/surface';

interface MediaPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly title: string;
  readonly status?: ReactNode;
  readonly footer?: ReactNode;
}

/** 미디어 카드의 외곽과 헤더를 소유하고 영상·canvas는 내부에서만 잘라낸다. */
export function MediaPanel({ title, status, footer, children, className, ...props }: MediaPanelProps) {
  return (
    <Surface
      {...props}
      className={cn(
        'grid h-full min-h-0 min-w-0 overflow-hidden p-0',
        footer === undefined ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-rows-[auto_minmax(0,1fr)_auto]',
        className,
      )}
      data-media-panel
      layer="canvas"
    >
      <header className="flex min-h-[var(--layout-control-height)] flex-wrap items-center justify-between gap-2 bg-layer-raised px-3 py-2" data-media-panel-header>
        <h3 className="min-w-0 text-sm font-semibold">{title}</h3>
        {status}
      </header>
      {children}
      {footer === undefined ? null : (
        <p className="px-3 py-2 text-xs leading-relaxed text-muted" data-media-panel-footer>{footer}</p>
      )}
    </Surface>
  );
}
