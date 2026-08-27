import type { AsyncQueryState } from '@/shared/lib/async-query';
import { Button } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Spinner } from '@/shared/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

import type { RobotDescriptor } from '../model/robot';
import type {
  PatrolRobotSnapshot,
  RobotOperationalStatus,
} from '../model/robot-operational-status';

type RobotInfoValue = boolean | number | string | null;

interface RobotInfoRow {
  readonly field: string;
  readonly value: RobotInfoValue;
}

function formatRawValue(value: RobotInfoValue): string {
  return value === null ? 'null' : String(value);
}

function getPatrolRows(status: PatrolRobotSnapshot): readonly RobotInfoRow[] {
  return [
    { field: 'id', value: status.id },
    { field: 'serialNumber', value: status.serialNumber },
    { field: 'name', value: status.name },
    { field: 'nickname', value: status.nickname },
    { field: 'description', value: status.description },
    { field: 'battery', value: status.battery },
    { field: 'isConnecting', value: status.isConnecting },
    { field: 'latitude', value: status.latitude },
    { field: 'longitude', value: status.longitude },
    { field: 'isAvailable', value: status.isAvailable },
    { field: 'isCharging', value: status.isCharging },
    { field: 'isMovable', value: status.isMovable },
    { field: 'isHeadLightOn', value: status.isHeadLightOn },
    { field: 'isCargoOpen', value: status.isCargoOpen },
  ];
}

interface RobotInfoTableProps {
  readonly operationalStatus: AsyncQueryState<RobotOperationalStatus | null>;
  readonly robot: RobotDescriptor;
}

export function RobotInfoTable({ operationalStatus, robot }: RobotInfoTableProps) {
  const rows = operationalStatus.status === 'ready'
    && operationalStatus.data !== null
    ? getPatrolRows(operationalStatus.data.data)
    : [];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-3">
        {operationalStatus.status === 'loading' ? (
          <Spinner label="운영 정보 불러오는 중" />
        ) : operationalStatus.status === 'error' ? (
          <ErrorMessage>{operationalStatus.message}</ErrorMessage>
        ) : operationalStatus.data === null ? (
          <p role="status">운영 정보가 제공되지 않았습니다.</p>
        ) : null}
        <Button
          className="shrink-0"
          disabled={operationalStatus.status === 'loading'}
          isLoading={operationalStatus.isRefreshing}
          onClick={operationalStatus.retry}
          variant="secondary"
        >
          정보 새로고침
        </Button>
      </div>
      {operationalStatus.refreshError === null ? null : (
        <ErrorMessage>
          {operationalStatus.refreshError}
        </ErrorMessage>
      )}
      <Table aria-label={`${robot.displayName} 로봇 정보`}>
        <TableHeader>
          <TableRow>
            <TableHead>필드</TableHead>
            <TableHead>값</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.field}>
              <TableCell><code>{row.field}</code></TableCell>
              <TableCell><code>{formatRawValue(row.value)}</code></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
