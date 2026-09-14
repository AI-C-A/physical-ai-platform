import { RobotCompanyAvatar, type RobotDescriptor, type RobotOperationalStatus } from '@/entities/robot';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Icon } from '@/shared/ui/icon';

import { getMonitoringRobotHealth } from '../model/monitoring-robot-health';

export const robotMonitoringListClassName =
  'grid min-h-0 flex-1 grid-cols-1 content-start gap-1 overflow-y-auto pb-3 [scrollbar-width:thin]';

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
  const toneClassName = health.tone === 'warning' ? 'text-warning' : 'text-muted';
  const rowClassName = [
    'ui-focus-inset min-h-[var(--layout-control-height)] w-full justify-between rounded-[var(--design-radius-list-row)] border-0 px-3 py-2.5 text-left',
    isSelected
      ? 'bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.08] active:bg-foreground/[0.1]'
      : 'bg-transparent hover:bg-foreground/[0.035] active:bg-foreground/[0.05]',
  ].filter(Boolean).join(' ');
  const label = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <RobotCompanyAvatar robot={robot} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-5">{robot.displayName}</span>
        <span className="mt-0.5 block truncate text-xs font-normal leading-4 text-muted">
          {getRobotSubtitle(robot)}
        </span>
        {health.label === null ? null : (
          <span className={`mt-1 block text-xs font-normal leading-4 ${toneClassName}`}>
            {health.label}
          </span>
        )}
      </span>
      <span className="flex w-12 shrink-0 items-center justify-end gap-1 self-center text-xs font-medium leading-5 tabular-nums text-muted">
        {health.isCharging ? (
          <span aria-label="충전 중" className="inline-flex" role="img" title="충전 중">
            <Icon name="charging" />
          </span>
        ) : null}
        {health.battery === null ? null : (
          <span aria-label={`배터리 ${String(health.battery)}%`}>
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
        className={`${rowClassName} ui-focus-within`}
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
