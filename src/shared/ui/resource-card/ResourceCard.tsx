import { Badge } from '@/shared/ui/badge';
import { ChoiceCard } from '@/shared/ui/choice-card';

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
    <ChoiceCard
      selected={selected}
      title={label}
      description={modelName}
      trailing={<Badge tone={tone}>{statusLabel}</Badge>}
      className="min-h-44"
      disabled={status === 'busy'}
      onClick={onSelect}
    >
      <span className="text-xs text-muted">Memory {memoryLabel}</span>
      <span className="h-2 overflow-hidden rounded-full bg-action-secondary"><span className="block h-full bg-action-primary" style={{ width: `${String(utilizationPercent)}%` }} /></span>
      <span className="text-xs text-muted">GPU Utilization {String(utilizationPercent)}%</span>
    </ChoiceCard>
  );
}
