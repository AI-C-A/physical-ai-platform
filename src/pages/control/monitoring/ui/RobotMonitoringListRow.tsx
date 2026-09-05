import type { RobotDescriptor, RobotOperationalStatus } from '@/entities/robot';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Icon } from '@/shared/ui/icon';

import { getMonitoringRobotHealth } from '../model/monitoring-robot-health';

export const robotMonitoringListClassName =
  'mt-4 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1';

interface RobotMonitoringListRowProps {
  readonly disabled?: boolean;
  readonly isStale?: boolean;
  readonly isSelected: boolean;
  readonly mode: 'single' | 'multiple';
  readonly onActivate: () => void;
  readonly robot: RobotDescriptor;
  readonly operationalStatus: RobotOperationalStatus | null | undefined;
}

function getRobotSubtitle(robot: RobotDescriptor): string {
  const serialNumber = robot.serialNumber ?? '기체 번호 미등록';
  if (robot.name === null || robot.name === robot.displayName) return serialNumber;
  return `${serialNumber} · ${robot.name}`;
}

export function RobotMonitoringListRow({
  disabled = false,
  isStale = false,
  isSelected,
  mode,
  onActivate,
  robot,
  operationalStatus,
}: RobotMonitoringListRowProps) {
  const health = getMonitoringRobotHealth(operationalStatus, isStale);
  const toneClassName = health.tone === 'negative' ? 'text-negative'
    : health.tone === 'warning' ? 'text-warning'
      : 'text-muted';
  const rowClassName = [
    'min-h-[var(--layout-control-height)] w-full justify-between rounded-[var(--design-radius-list-row)] border-0 px-3 py-3 text-left',
    isSelected
      ? 'bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.08] active:bg-foreground/[0.1]'
      : 'bg-transparent hover:bg-foreground/[0.035] active:bg-foreground/[0.05]',
  ].filter(Boolean).join(' ');
  const label = (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-semibold">{robot.displayName}</span>
      <span className="mt-0.5 block truncate text-xs font-normal text-muted">
        {getRobotSubtitle(robot)}
      </span>
      <span className={`mt-2 flex items-center justify-between gap-2 text-xs font-medium ${toneClassName}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name={health.tone === 'negative' ? 'wifi-off'
            : health.tone === 'warning' ? 'events'
              : health.label === '충전 중' ? 'charging' : 'radio'} />
          {health.label}
        </span>
        {health.battery === null ? null : (
          <span className="shrink-0 tabular-nums" aria-label={`배터리 ${String(health.battery)}%`}>
            {Math.round(health.battery)}%
          </span>
        )}
      </span>
    </span>
  );

  if (mode === 'multiple') {
    return (
      <Checkbox
        checked={isSelected}
        className={`${rowClassName} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-inset`}
        disabled={disabled}
        indicatorPosition="end"
        label={label}
        onCheckedChange={onActivate}
      />
    );
  }

  return (
    <Button
      aria-pressed={isSelected}
      className={rowClassName}
      onClick={onActivate}
      variant="ghost"
    >
      {label}
    </Button>
  );
}
