import type {
  RobotDescriptor,
  RobotOperationalStatus,
} from '@/entities/robot';

import {
  RobotMonitoringListRow,
  robotMonitoringListClassName,
} from './RobotMonitoringListRow';

interface RobotMultiSelectionListProps {
  readonly maximumSelection: number;
  readonly minimumSelection?: number;
  readonly onToggleRobot: (robotId: string) => void;
  readonly operationalStatuses: Readonly<Record<string, RobotOperationalStatus | null>>;
  readonly robots: readonly RobotDescriptor[];
  readonly selectedRobotIds: readonly string[];
  readonly staleRobotIds?: ReadonlySet<string>;
}

export function RobotMultiSelectionList({
  maximumSelection,
  minimumSelection = 0,
  onToggleRobot,
  operationalStatuses,
  robots,
  selectedRobotIds,
  staleRobotIds,
}: RobotMultiSelectionListProps) {
  const selectedRobotIdSet = new Set(selectedRobotIds);

  return (
    <ul
      aria-label="다중 관제 로봇 선택"
      className={robotMonitoringListClassName}
    >
      {robots.map((robot) => {
        const isSelected = selectedRobotIdSet.has(robot.id);
        const selectionLimitReached = !isSelected
          && selectedRobotIds.length >= maximumSelection;
        const minimumSelectionReached = isSelected
          && selectedRobotIds.length <= minimumSelection;

        return (
          <li key={robot.id}>
            <RobotMonitoringListRow
              disabled={selectionLimitReached || minimumSelectionReached}
              isStale={staleRobotIds?.has(robot.id) ?? false}
              isSelected={isSelected}
              mode="multiple"
              onActivate={() => onToggleRobot(robot.id)}
              operationalStatus={operationalStatuses[robot.id]}
              robot={robot}
            />
          </li>
        );
      })}
    </ul>
  );
}
