import { Badge } from '@/shared/ui/badge';

interface ResourceCardProps {
  readonly label: string;
  readonly memoryLabel: string;
  readonly modelName: string;
  readonly selected?: boolean;
  readonly status: 'idle' | 'medium' | 'busy';
  readonly utilizationPercent: number;
  readonly onSelect?: () => void;
}

export function ResourceCard({ label, memoryLabel, modelName, onSelect, selected = false, status, utilizationPercent }: ResourceCardProps) {
  const statusLabel = status === 'idle' ? 'Idle' : status === 'medium' ? 'Medium' : 'Busy';
  const tone = status === 'idle' ? 'positive' : status === 'medium' ? 'info' : 'negative';
  return (
    <button
      aria-pressed={selected}
      className={selected
        ? 'grid min-h-44 w-full gap-3 rounded-[var(--design-radius-surface)] border-2 border-focus bg-layer-base p-5 text-left'
        : 'grid min-h-44 w-full gap-3 rounded-[var(--design-radius-surface)] border border-border bg-layer-base p-5 text-left hover:border-focus'}
      disabled={status === 'busy'}
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-start justify-between gap-3"><strong>{label}</strong><Badge tone={tone}>{statusLabel}</Badge></span>
      <span className="text-sm text-muted">{modelName}</span>
      <span className="text-xs text-muted">Memory {memoryLabel}</span>
      <span className="h-2 overflow-hidden rounded-full bg-action-secondary"><span className="block h-full bg-action-primary" style={{ width: `${String(utilizationPercent)}%` }} /></span>
      <span className="text-xs text-muted">GPU Utilization {String(utilizationPercent)}%</span>
    </button>
  );
}
