import { Button } from '@/shared/ui/button';

export interface TimelineMarker {
  readonly id: string;
  readonly label: string;
  readonly offsetPercent: number;
  readonly tone?: 'neutral' | 'positive' | 'negative' | 'info';
}

interface TimelineProps {
  readonly durationLabel: string;
  readonly markers: readonly TimelineMarker[];
  readonly onMarkerSelect?: (marker: TimelineMarker) => void;
  readonly title?: string;
}

export function Timeline({ durationLabel, markers, onMarkerSelect, title = '동기화 타임라인' }: TimelineProps) {
  return (
    <section aria-label={title} className="grid gap-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <strong>{title}</strong>
        <span className="text-muted">{durationLabel}</span>
      </div>
      <div className="relative h-3 rounded-full bg-action-secondary" role="img" aria-label={`${markers.length}개 이벤트가 있는 ${durationLabel} 타임라인`}>
        {markers.map((marker) => (
          <span
            aria-hidden="true"
            className={marker.tone === 'negative'
              ? 'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-status-negative-foreground'
              : marker.tone === 'positive'
                ? 'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-status-positive-foreground'
                : 'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-action-primary'}
            key={marker.id}
            style={{ left: `${String(Math.max(0, Math.min(100, marker.offsetPercent)))}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {markers.map((marker) => (
          <Button
            key={marker.id}
            onClick={() => onMarkerSelect?.(marker)}
            variant="secondary"
          >
            {marker.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
