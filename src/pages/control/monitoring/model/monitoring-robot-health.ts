import type { RobotDescriptor, RobotOperationalStatus } from '@/entities/robot';

export type MonitoringRobotFilter = 'all' | 'attention';
export type MonitoringRobotSort = 'name' | 'attention' | 'battery';

export function getMonitoringRobotHealth(
  status: RobotOperationalStatus | null | undefined,
  isStale = false,
) {
  const value = status?.data.battery;
  const battery = value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;

  if (isStale) return { battery, label: '수신 지연', priority: 0, tone: 'warning' } as const;
  if (status == null) return { battery, label: '상태 미수신', priority: 1, tone: 'muted' } as const;
  if (!status.data.isConnecting) return { battery, label: '연결 끊김', priority: 0, tone: 'negative' } as const;
  if (status.data.isCharging) return { battery, label: '충전 중', priority: 4, tone: 'positive' } as const;
  if (battery === null) return { battery, label: '배터리 미수신', priority: 1, tone: 'warning' } as const;
  if (battery <= 20) return { battery, label: '배터리 부족', priority: 2, tone: 'warning' } as const;
  return { battery, label: '연결됨', priority: 3, tone: 'positive' } as const;
}

export function needsMonitoringAttention(
  status: RobotOperationalStatus | null | undefined,
  isStale = false,
) {
  return getMonitoringRobotHealth(status, isStale).priority < 3;
}

export function filterMonitoringRobots({
  filter,
  robots,
  search,
  sort,
  staleRobotIds,
  statuses,
}: {
  readonly filter: MonitoringRobotFilter;
  readonly robots: readonly RobotDescriptor[];
  readonly search: string;
  readonly sort: MonitoringRobotSort;
  readonly staleRobotIds: ReadonlySet<string>;
  readonly statuses: Readonly<Record<string, RobotOperationalStatus | null>>;
}) {
  const query = search.trim().toLocaleLowerCase();
  const health = (robot: RobotDescriptor) =>
    getMonitoringRobotHealth(statuses[robot.id], staleRobotIds.has(robot.id));

  return robots.filter((robot) => {
    const matchesSearch = [robot.displayName, robot.id, robot.serialNumber, robot.name]
      .some((value) => value?.toLocaleLowerCase().includes(query));
    return matchesSearch && (filter === 'all' || health(robot).priority < 3);
  }).sort((left, right) => {
    const a = health(left);
    const b = health(right);
    const statusOrder = sort === 'attention'
      ? a.priority - b.priority
      : sort === 'battery' ? (a.battery ?? Infinity) - (b.battery ?? Infinity) : 0;
    return (Number.isNaN(statusOrder) ? 0 : statusOrder)
      || left.displayName.localeCompare(right.displayName, 'ko')
      || left.id.localeCompare(right.id);
  });
}
