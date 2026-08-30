import type { AsyncQueryState } from '@/shared/lib/async-query';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/ui/class-names';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Icon } from '@/shared/ui/icon';
import { Spinner } from '@/shared/ui/spinner';

import type { RobotDescriptor } from '../model/robot';
import type {
  PatrolRobotSnapshot,
  RobotOperationalStatus,
  RobotOperationalStatusStreamIssue,
} from '../model/robot-operational-status';
import { RealtimeStatusNotice } from './RealtimeStatusNotice';

const batteryNumberFormat = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 1,
});
const coordinateNumberFormat = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 6,
});
const cardSurfaceClassName =
  'rounded-md bg-foreground/[0.035] p-4';

function formatBatteryPercentage(value: number): string {
  return `${batteryNumberFormat.format(value)}%`;
}

function formatCoordinate(
  value: number,
  axis: 'latitude' | 'longitude',
): string {
  const direction = axis === 'latitude'
    ? value >= 0 ? 'N' : 'S'
    : value >= 0 ? 'E' : 'W';
  return `${coordinateNumberFormat.format(Math.abs(value))}° ${direction}`;
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function BatteryIndicator({
  battery,
  batteryLabel,
  isCharging,
}: {
  readonly battery: number;
  readonly batteryLabel: string;
  readonly isCharging: boolean;
}) {
  const batteryTone = isCharging
    ? 'bg-status-positive-foreground'
    : 'bg-foreground';

  return (
    <section
      aria-label={'배터리 ' + batteryLabel + (isCharging ? ', 충전 중' : '')}
      className={cn(cardSurfaceClassName, 'text-foreground')}
      data-card-surface
      role="group"
    >
      <div>
        <p className="text-xs font-medium text-muted">
          배터리
        </p>
        <div className="mt-1 flex items-center gap-2">
          {isCharging ? (
            <span
              aria-label="충전 중"
              className="inline-flex shrink-0 text-status-positive-foreground"
              role="img"
            >
              <Icon filled name="charging" size="md" />
            </span>
          ) : null}
          <p className="text-3xl font-light tracking-tight tabular-nums">
            {batteryLabel}
          </p>
        </div>
      </div>
      <div
        aria-label="배터리 잔량"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={battery}
        aria-valuetext={batteryLabel}
        className="mt-5 h-2.5 overflow-hidden rounded-full bg-foreground/10"
        role="progressbar"
      >
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-500',
            batteryTone,
          )}
          data-battery-fill
          style={{ width: battery + '%' }}
        />
      </div>
    </section>
  );
}

function RobotSnapshotOverview({
  isStale,
  status,
}: {
  readonly isStale: boolean;
  readonly status: PatrolRobotSnapshot;
}) {
  const connectionLabel = isStale
    ? '마지막 상태: 로봇 오프라인'
    : '로봇 오프라인';
  const hasLocation = status.latitude !== null
    && status.longitude !== null
    && !(status.latitude === 0 && status.longitude === 0);

  return (
    <div className="grid gap-3">
      {status.isConnecting ? null : (
        <section
          aria-label="연결 상태"
          className={cardSurfaceClassName}
          data-card-surface
          role="group"
        >
          <p
            aria-atomic="true"
            className="flex items-center gap-2 text-sm font-medium text-negative"
            role="status"
          >
            <Icon name="wifi-off" />
            {connectionLabel}
          </p>
        </section>
      )}

      <BatteryIndicator
        battery={status.battery}
        batteryLabel={formatBatteryPercentage(status.battery)}
        isCharging={status.isCharging}
      />

      <section
        aria-label="현재 위치"
        className={cardSurfaceClassName}
        data-card-surface
      >
        <h3 className="text-xs font-medium text-muted">현재 위치</h3>
        {hasLocation ? (
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <DetailRow
              label="위도"
              value={formatCoordinate(status.latitude, 'latitude')}
            />
            <DetailRow
              label="경도"
              value={formatCoordinate(status.longitude, 'longitude')}
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted">
            GPS 신호를 수신하지 못했습니다.
          </p>
        )}
      </section>

      <section
        aria-label="기체 식별 정보"
        className={cardSurfaceClassName}
        data-card-surface
      >
        <dl className="grid gap-2.5 text-xs">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <dt className="shrink-0 text-muted">일련번호</dt>
            <dd className="min-w-0 truncate text-right font-medium text-foreground tabular-nums">
              {status.serialNumber ?? '미등록'}
            </dd>
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <dt className="shrink-0 text-muted">시스템 이름</dt>
            <dd className="min-w-0 truncate text-right font-medium text-foreground">
              {status.name ?? '미등록'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

interface RobotInfoOverviewProps {
  readonly operationalStatus: AsyncQueryState<RobotOperationalStatus | null> & {
    readonly streamIssue?: RobotOperationalStatusStreamIssue | null;
  };
  readonly robot: RobotDescriptor;
}

export function RobotInfoOverview({
  operationalStatus,
  robot,
}: RobotInfoOverviewProps) {
  const snapshot = operationalStatus.status === 'ready'
    && operationalStatus.data !== null
    ? operationalStatus.data.data
    : null;
  const fallbackStreamIssue: RobotOperationalStatusStreamIssue | null =
    operationalStatus.status === 'ready' && operationalStatus.refreshError !== null
      ? {
          lastSuccessfulAtMs: operationalStatus.data?.receivedTimestampMs ?? null,
          message: operationalStatus.refreshError,
          reason: 'status-unavailable',
        }
      : null;
  const streamIssue = operationalStatus.streamIssue ?? fallbackStreamIssue;

  return (
    <section aria-label={`${robot.displayName} 로봇 정보`} className="grid gap-3">
      {operationalStatus.status === 'loading' ? (
        <div className="flex items-center justify-end">
          <Spinner label="운영 정보 불러오는 중" />
        </div>
      ) : operationalStatus.status === 'error' ? (
        <div className="grid gap-2">
          <ErrorMessage>{operationalStatus.message}</ErrorMessage>
          <Button
            className="justify-self-start"
            onClick={operationalStatus.retry}
            variant="secondary"
          >다시 불러오기</Button>
        </div>
      ) : operationalStatus.status === 'ready' && operationalStatus.data === null ? (
        <p role="status">운영 정보가 제공되지 않았습니다.</p>
      ) : null}
      {streamIssue === null ? null : (
        <RealtimeStatusNotice
          fallbackLastSuccessfulAtMs={operationalStatus.status === 'ready'
            ? operationalStatus.data?.receivedTimestampMs ?? null
            : null}
          issue={streamIssue}
          onRetry={operationalStatus.retry}
        />
      )}
      {snapshot === null ? null : (
        <RobotSnapshotOverview isStale={streamIssue !== null} status={snapshot} />
      )}
    </section>
  );
}
