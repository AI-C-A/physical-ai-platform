import type { RobotDescriptor } from '@/entities/robot';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';

export const robotMonitoringListClassName =
  'mt-4 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1';

interface RobotMonitoringListRowProps {
  readonly disabled?: boolean;
  readonly isDisconnected: boolean;
  readonly isSelected: boolean;
  readonly mode: 'single' | 'multiple';
  readonly onActivate: () => void;
  readonly robot: RobotDescriptor;
}

function getRobotSubtitle(robot: RobotDescriptor): string {
  const serialNumber = robot.serialNumber ?? '—';
  if (robot.name === null || robot.name === robot.displayName) return serialNumber;
  return `${serialNumber} · ${robot.name}`;
}

export function RobotMonitoringListRow({
  disabled = false,
  isDisconnected,
  isSelected,
  mode,
  onActivate,
  robot,
}: RobotMonitoringListRowProps) {
  const rowClassName = [
    'min-h-[var(--layout-control-height)] w-full justify-between rounded-[var(--design-radius-list-row)] border-0 px-3 py-2 text-left',
    isSelected
      ? 'bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.08] active:bg-foreground/[0.1]'
      : 'bg-transparent hover:bg-foreground/[0.035] active:bg-foreground/[0.05]',
    isDisconnected ? 'opacity-50' : undefined,
  ].filter(Boolean).join(' ');
  const label = (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-semibold">{robot.displayName}</span>
      <span className="block truncate text-xs font-normal">
        {getRobotSubtitle(robot)}
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
