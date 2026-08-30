import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  useAnalyticsPort,
  type AnalyticsOperationQuery,
  type AnalyticsOperationResult,
  type AnalyticsRecordType,
  type TelemetryAggregateQuery,
  type TelemetryAggregateResult,
} from '@/entities/analytics';
import {
  getCaptureSessionStatusLabel,
  type CaptureSessionStatus,
} from '@/entities/capture-session';
import { getDatasetStatusLabel } from '@/entities/dataset';
import { useRobotCatalog } from '@/entities/robot';
import {
  getExecutionProvenanceLabel,
  getDeliveryModeLabel,
  getExecutionEnvironmentLabel,
} from '@/shared/domain';
import { useAsyncQuery } from '@/shared/lib/async-query';
import { useClock } from '@/shared/lib/clock';
import {
  createRecordSetSearchKey,
  paginate,
  readPositivePage,
} from '@/shared/lib/collection-query';
import { appendPathSegment } from '@/shared/lib/navigation';
import {
  formatBytes,
  formatDateTime,
  getDisplayTimeZoneLabel,
} from '@/shared/lib/format';
import {
  useRecordExport,
  type ExportRecord,
  type RecordExportFormat,
} from '@/shared/lib/record-export';
import { Button } from '@/shared/ui/button';
import { Chart } from '@/shared/ui/chart';
import { Dropdown } from '@/shared/ui/dropdown';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { PageToolbar } from '@/shared/ui/page-toolbar';
import { Pagination } from '@/shared/ui/pagination';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Select } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Tabs } from '@/shared/ui/tabs';

import {
  formatLocalDateInput,
  parseLocalDateEnd,
  parseLocalDateStart,
} from '../model/local-date-range';

const captureStatuses: readonly CaptureSessionStatus[] = [
  'draft',
  'validating',
  'ready',
  'starting',
  'recording',
  'stopping',
  'finalizing',
  'processing',
  'completed',
  'failed',
  'interrupted',
];

const allRobotsOptionValue = 'filter:all';
const allStatusesOptionValue = 'filter:all-statuses';
const statusOptionValuePrefix = 'status:';

function getRobotOptionValue(robotId: string): string {
  return `robot:${robotId}`;
}

function readRobotOptionValue(value: string): string | null {
  return value === allRobotsOptionValue ? null : value.slice('robot:'.length);
}

function getStatusOptionValue(status: string): string {
  return `${statusOptionValuePrefix}${status}`;
}

const statusValuesByType: Readonly<
  Record<AnalyticsRecordType, readonly string[]>
> = {
  session: captureStatuses,
  episode: ['completed'],
  dataset: ['draft'],
};

function getRecordPath(type: AnalyticsRecordType, id: string): string {
  if (type === 'episode') return appendPathSegment('/mlops/episodes', id);
  if (type === 'dataset') return appendPathSegment('/mlops/datasets', id);
  return appendPathSegment('/mlops/sessions', id);
}

function readRecordType(value: string | null): AnalyticsRecordType {
  if (value === 'episode' || value === 'dataset') return value;
  return 'session';
}

function getRecordTypeLabel(value: AnalyticsRecordType): string {
  if (value === 'episode') return '에피소드';
  if (value === 'dataset') return '데이터셋';
  return '수집 세션';
}

function isCaptureStatus(value: string): value is CaptureSessionStatus {
  return (
    value === 'draft'
    || value === 'validating'
    || value === 'ready'
    || value === 'starting'
    || value === 'recording'
    || value === 'stopping'
    || value === 'finalizing'
    || value === 'processing'
    || value === 'completed'
    || value === 'interrupted'
    || value === 'failed'
  );
}

function getRecordStatusLabel(value: string): string {
  if (isCaptureStatus(value)) return getCaptureSessionStatusLabel(value);
  if (value === 'draft') return getDatasetStatusLabel(value);
  return `미분류 상태 (${value.length === 0 ? '빈 값' : value})`;
}

type ExplorerRange = '1' | '7' | '30' | 'custom';

function readRange(value: string | null): ExplorerRange {
  if (value === '1' || value === '30' || value === 'custom') return value;
  return '7';
}

function getChannelLabel(value: TelemetryAggregateQuery['channel']): string {
  return value === 'battery' ? '배터리 채널 집계값' : '위치 채널 집계값';
}

type ExplorerMode = 'operations' | 'telemetry';

type ExplorerQueryResult =
  | {
      readonly mode: 'operations';
      readonly data: AnalyticsOperationResult;
      readonly query: AnalyticsOperationQuery | null;
    }
  | {
      readonly mode: 'telemetry';
      readonly data: TelemetryAggregateResult;
      readonly query: TelemetryAggregateQuery | null;
    };

const emptyOperations: AnalyticsOperationResult = { records: [], groups: [] };
const emptyTelemetry: TelemetryAggregateResult = {
  bucketMs: 0,
  displayedPointCount: 0,
  points: [],
};
const operationPageSize = 20;

export function BigDataExplorerPage() {
  const [params] = useSearchParams();
  const mode: ExplorerMode = params.get('mode') === 'telemetry'
    ? 'telemetry'
    : 'operations';
  return <BigDataExplorerContent mode={mode} />;
}

interface BigDataExplorerContentProps {
  readonly mode: ExplorerMode;
}

function BigDataExplorerContent({ mode }: BigDataExplorerContentProps) {
  const analytics = useAnalyticsPort();
  const robots = useRobotCatalog();
  const clock = useClock();
  const anchorMs = useMemo(() => clock.nowMs(), [clock]);
  const [params, setParams] = useSearchParams();
  const type = readRecordType(params.get('type'));
  const status = params.get('status');
  const group = params.get('group') === 'status' || params.get('group') === 'robot'
    ? params.get('group') as AnalyticsOperationQuery['groupBy']
    : 'none';
  const supportsExecutionFilters = type !== 'dataset';
  const effectiveGroup = type === 'dataset' && group === 'robot' ? 'none' : group;
  const requestedOperationRobotId = params.get('robot');
  const hasExplicitOperationRobot = requestedOperationRobotId !== null;
  const operationRobotId = requestedOperationRobotId;
  const hasInvalidOperationRobot = supportsExecutionFilters
    && robots.status === 'ready'
    && hasExplicitOperationRobot
    && !robots.robots.some((robot) => robot.id === requestedOperationRobotId);
  const environment = params.get('environment') === 'physical'
    || params.get('environment') === 'simulation'
    ? params.get('environment') as NonNullable<AnalyticsOperationQuery['environment']>
    : 'all';
  const deliveryMode = params.get('deliveryMode') === 'live'
    || params.get('deliveryMode') === 'replay'
    ? params.get('deliveryMode') as NonNullable<AnalyticsOperationQuery['deliveryMode']>
    : 'all';
  const requestedRobotId = params.get('robotId');
  const defaultTelemetryRobotId = robots.status === 'ready'
    ? robots.robots[0]?.id ?? ''
    : '';
  const robotId = robots.status === 'ready'
    ? requestedRobotId ?? defaultTelemetryRobotId
    : '';
  const hasInvalidTelemetryRobot = robots.status === 'ready'
    && requestedRobotId !== null
    && !robots.robots.some((robot) => robot.id === requestedRobotId);
  const channel: TelemetryAggregateQuery['channel'] = params.get('channel') === 'battery'
    ? 'battery'
    : 'pose';
  const requestedRange = readRange(params.get('range'));
  const requestedOperationPage = readPositivePage(params.get('page'));
  const exportScopeKey = createRecordSetSearchKey(params);
  const exportScopeKeyRef = useRef(exportScopeKey);
  useLayoutEffect(() => {
    exportScopeKeyRef.current = exportScopeKey;
  }, [exportScopeKey]);
  const range: ExplorerRange = requestedRange === 'custom'
    || params.has('start')
    || params.has('end')
    ? 'custom'
    : requestedRange;
  const fallbackRangeDays = requestedRange === 'custom'
    ? 7
    : Number(requestedRange);
  const defaultStartDate = formatLocalDateInput(
    anchorMs - fallbackRangeDays * 86_400_000,
  );
  const defaultEndDate = formatLocalDateInput(anchorMs);
  const requestedStartDate = params.get('start');
  const requestedEndDate = params.get('end');
  const startDate = requestedStartDate ?? defaultStartDate;
  const endDate = requestedEndDate ?? defaultEndDate;
  const parsedStartMs = parseLocalDateStart(startDate);
  const parsedEndMs = parseLocalDateEnd(endDate);
  const hasInvalidDateInput = range === 'custom'
    && (
      requestedStartDate === null
      || requestedEndDate === null
      || parsedStartMs === null
      || parsedEndMs === null
    );
  const candidateStartMs = parsedStartMs
    ?? anchorMs - fallbackRangeDays * 86_400_000;
  const candidateEndMs = parsedEndMs ?? anchorMs;
  const hasInvalidRange = hasInvalidDateInput
    || (range === 'custom' && candidateStartMs > candidateEndMs);
  const operationRequiresRobotCatalog = supportsExecutionFilters
    && hasExplicitOperationRobot;
  const canLoadOperations = !hasInvalidRange
    && !hasInvalidOperationRobot
    && (!operationRequiresRobotCatalog || robots.status === 'ready');
  const canLoadTelemetry = !hasInvalidRange
    && robots.status === 'ready'
    && requestedRobotId !== null
    && robotId !== ''
    && !hasInvalidTelemetryRobot;

  useEffect(() => {
    if (
      mode !== 'telemetry'
      || robots.status !== 'ready'
      || requestedRobotId !== null
      || defaultTelemetryRobotId === ''
    ) {
      return;
    }
    const next = new URLSearchParams(params);
    next.set('robotId', defaultTelemetryRobotId);
    setParams(next, { replace: true });
  }, [defaultTelemetryRobotId, mode, params, requestedRobotId, robots.status, setParams]);
  const loadOperations = useCallback(
    async (): Promise<ExplorerQueryResult> => {
      if (!canLoadOperations) {
        return { mode: 'operations', data: emptyOperations, query: null };
      }
      const currentEndMs = range === 'custom' ? candidateEndMs : clock.nowMs();
      const query: AnalyticsOperationQuery = {
        startMs: range === 'custom'
          ? candidateStartMs
          : currentEndMs - Number(range) * 86_400_000,
        endMs: currentEndMs,
        robotId: supportsExecutionFilters ? operationRobotId : null,
        type,
        status,
        environment: !supportsExecutionFilters || environment === 'all' ? null : environment,
        deliveryMode: !supportsExecutionFilters || deliveryMode === 'all' ? null : deliveryMode,
        groupBy: effectiveGroup,
      };
      return {
        mode: 'operations',
        data: await analytics.queryOperations(query),
        query,
      };
    },
    [analytics, candidateEndMs, candidateStartMs, canLoadOperations, clock, deliveryMode, effectiveGroup, environment, operationRobotId, range, status, supportsExecutionFilters, type],
  );
  const loadTelemetry = useCallback(
    async (): Promise<ExplorerQueryResult> => {
      if (!canLoadTelemetry) {
        return { mode: 'telemetry', data: emptyTelemetry, query: null };
      }
      const currentEndMs = range === 'custom' ? candidateEndMs : clock.nowMs();
      const query: TelemetryAggregateQuery = {
        robotId,
        channel,
        startMs: range === 'custom'
          ? candidateStartMs
          : currentEndMs - Number(range) * 86_400_000,
        endMs: currentEndMs,
        maxPoints: 720,
      };
      return {
        mode: 'telemetry',
        data: await analytics.queryTelemetry(query),
        query,
      };
    },
    [analytics, candidateEndMs, candidateStartMs, canLoadTelemetry, channel, clock, range, robotId],
  );
  const load = mode === 'operations' ? loadOperations : loadTelemetry;
  const subscribe = useCallback(
    (listener: () => void) => analytics.subscribe(listener),
    [analytics],
  );
  const result = useAsyncQuery(
    load,
    (mode === 'operations' ? canLoadOperations : canLoadTelemetry)
      ? subscribe
      : undefined,
    { retainPreviousData: true },
  );
  const recordExport = useRecordExport();

  function update(key: string, value: string): void {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  function updateRobot(key: 'robot' | 'robotId', value: string): void {
    const next = new URLSearchParams(params);
    const selectedRobotId = readRobotOptionValue(value);
    if (selectedRobotId === null) {
      next.delete(key);
    } else {
      next.set(key, selectedRobotId);
    }
    next.delete('page');
    setParams(next);
  }

  function updateStatus(value: string): void {
    const next = new URLSearchParams(params);
    if (value === allStatusesOptionValue) {
      next.delete('status');
    } else if (value.startsWith(statusOptionValuePrefix)) {
      next.set('status', value.slice(statusOptionValuePrefix.length));
    } else {
      return;
    }
    next.delete('page');
    setParams(next);
  }

  function updateType(value: string): void {
    const next = new URLSearchParams(params);
    next.set('type', value);
    next.delete('status');
    next.delete('page');
    if (value === 'dataset') {
      next.delete('robot');
      next.delete('environment');
      next.delete('deliveryMode');
      if (next.get('group') === 'robot') next.delete('group');
    }
    setParams(next);
  }

  function updateRange(value: string): void {
    const next = new URLSearchParams(params);
    next.set('range', value);
    next.delete('page');
    if (value === 'custom') {
      next.set('start', startDate);
      next.set('end', endDate);
    } else {
      next.delete('start');
      next.delete('end');
    }
    setParams(next);
  }

  function updateDate(key: 'start' | 'end', value: string): void {
    const next = new URLSearchParams(params);
    next.set('range', 'custom');
    next.set(key, value);
    next.delete('page');
    setParams(next);
  }

  const currentModeRequiresRobotCatalog = mode === 'telemetry'
    || operationRequiresRobotCatalog;
  if (
    (currentModeRequiresRobotCatalog && robots.status === 'loading')
    || result.status === 'loading'
  ) {
    return <QueryFeedback kind="loading" />;
  }
  if (currentModeRequiresRobotCatalog && robots.status === 'error') {
    return <QueryFeedback kind="error" message={robots.message} onRetry={robots.retry} />;
  }
  const invalidRobotId = mode === 'operations'
    ? hasInvalidOperationRobot
    : hasInvalidTelemetryRobot;
  if (invalidRobotId) {
    const requestedId = mode === 'operations'
      ? requestedOperationRobotId
      : requestedRobotId;
    return (
      <div className="grid gap-6">
        <PageHeader title="데이터 탐색" />
        <Panel title="로봇 필터를 적용하지 않았습니다">
          <ErrorMessage>등록 목록에 없는 로봇 ID입니다: {requestedId}</ErrorMessage>
          <Button
            className="mt-4"
            onClick={() => updateRobot(
              mode === 'operations' ? 'robot' : 'robotId',
              mode === 'operations'
                ? allRobotsOptionValue
                : getRobotOptionValue(robots.robots[0]?.id ?? ''),
            )}
            variant="secondary"
          >
            {mode === 'operations' ? '전체 로봇 보기' : '첫 로봇 보기'}
          </Button>
        </Panel>
      </div>
    );
  }
  if (result.status === 'error') {
    return <QueryFeedback kind="error" message={result.message} onRetry={result.retry} />;
  }

  const operationResult = result.data.mode === 'operations' ? result.data : null;
  const telemetryResult = result.data.mode === 'telemetry' ? result.data : null;
  const operations = operationResult?.data ?? emptyOperations;
  const telemetry = telemetryResult?.data ?? emptyTelemetry;
  const displayedOperationType = operationResult?.query?.type ?? type;
  const displayedOperationGroup = operationResult?.query?.groupBy ?? effectiveGroup;
  const displayedTelemetryRobotId = telemetryResult?.query?.robotId ?? robotId;
  const displayedTelemetryChannel = telemetryResult?.query?.channel ?? channel;
  const hasResultForCurrentMode = result.data.mode === mode
    && result.data.query !== null;
  const pagedOperations = paginate(
    operations.records,
    requestedOperationPage,
    operationPageSize,
  );
  const exportRecords: readonly ExportRecord[] = mode === 'operations'
    ? operations.records.map((record) => ({
        id: record.id,
        type: record.type,
        status: record.status,
        robotId: record.robotId,
        environment: record.provenance?.environment ?? null,
        deliveryMode: record.provenance?.deliveryMode ?? null,
        controlMode: record.provenance?.controlMode ?? null,
        dataOrigin: record.provenance?.dataOrigin ?? null,
        timestamp: new Date(record.timestampMs).toISOString(),
        bytes: record.bytes,
      }))
    : telemetry.points.map((point) => ({
        timestamp: new Date(point.timestampMs).toISOString(),
        robotId: displayedTelemetryRobotId,
        channel: displayedTelemetryChannel,
        average: point.average,
        minimum: point.minimum,
        maximum: point.maximum,
        sampleCount: point.sampleCount,
      }));
  const exportDisabled = result.isRefreshing
    || result.refreshError !== null
    || recordExport.isExporting
    || hasInvalidRange
    || exportRecords.length === 0;

  function exportResults(format: RecordExportFormat): void {
    if (exportDisabled) return;
    void recordExport.start({
      baseFileName: 'bigdata-explorer',
      format,
      isCurrent: () => exportScopeKeyRef.current === exportScopeKey,
      loadRecords: () => Promise.resolve(exportRecords),
      subscribeInvalidation: (listener) => analytics.subscribe(listener),
    });
  }

  const rangeControls = (
    <>
      <Select
        label="기간"
        onValueChange={updateRange}
        options={[
          { label: '24시간', value: '1' },
          { label: '7일', value: '7' },
          { label: '30일', value: '30' },
          { label: '사용자 지정', value: 'custom' },
        ]}
        value={range}
      />
      {range === 'custom' ? (
        <>
          <Input
            label="시작일"
            onChange={(event) => updateDate('start', event.target.value)}
            type="date"
            value={startDate}
          />
          <Input
            label="종료일"
            onChange={(event) => updateDate('end', event.target.value)}
            type="date"
            value={endDate}
          />
        </>
      ) : null}
    </>
  );

  const invalidRangeFeedback = hasInvalidRange ? (
    <Panel title="기간을 확인해 주세요">
      <ErrorMessage>
        {hasInvalidDateInput
          ? '사용자 지정 시작일과 종료일을 올바른 날짜로 모두 입력해야 합니다.'
          : '시작일은 종료일보다 늦을 수 없습니다.'}
      </ErrorMessage>
      <Button className="mt-4" onClick={() => updateRange('7')} variant="secondary">
        최근 7일로 재설정
      </Button>
    </Panel>
  ) : null;

  const operationsContent = (
    <div className="grid gap-4">
      <PageToolbar aria-label="운영 기록 필터">
        <Select
          label="기록 종류"
          onValueChange={updateType}
          options={[
            { label: '수집 세션', value: 'session' },
            { label: '에피소드', value: 'episode' },
            { label: '데이터셋', value: 'dataset' },
          ]}
          value={type}
        />
        <Select
          label="상태"
          onValueChange={updateStatus}
          options={[
            { label: '전체', value: allStatusesOptionValue },
            ...statusValuesByType[type].map((value) => ({
              label: getRecordStatusLabel(value),
              value: getStatusOptionValue(value),
            })),
            ...(status !== null && !statusValuesByType[type].includes(status)
              ? [{
                  label: getRecordStatusLabel(status),
                  value: getStatusOptionValue(status),
                }]
              : []),
          ]}
          value={status === null
            ? allStatusesOptionValue
            : getStatusOptionValue(status)}
        />
        <Select
          label="그룹"
          onValueChange={(value) => update('group', value)}
          options={[
            { label: '그룹 없음', value: 'none' },
            { label: '상태별', value: 'status' },
            ...(supportsExecutionFilters ? [{ label: '로봇별', value: 'robot' }] : []),
          ]}
          value={effectiveGroup}
        />
        {supportsExecutionFilters ? (
          <>
            <Select
              disabled={robots.status !== 'ready'}
              label="로봇"
              onValueChange={(value) => updateRobot('robot', value)}
              options={[
                { label: '전체', value: allRobotsOptionValue },
                ...robots.robots.map((robot) => ({
                  label: robot.displayName,
                  value: getRobotOptionValue(robot.id),
                })),
              ]}
              value={operationRobotId === null
                ? allRobotsOptionValue
                : getRobotOptionValue(operationRobotId)}
            />
            <Select
              label="실행 환경"
              onValueChange={(value) => update('environment', value)}
              options={[
                { label: '전체', value: 'all' },
                { label: getExecutionEnvironmentLabel('physical'), value: 'physical' },
                { label: getExecutionEnvironmentLabel('simulation'), value: 'simulation' },
              ]}
              value={environment}
            />
            <Select
              label="전달 방식"
              onValueChange={(value) => update('deliveryMode', value)}
              options={[
                { label: '전체', value: 'all' },
                { label: getDeliveryModeLabel('live'), value: 'live' },
                { label: getDeliveryModeLabel('replay'), value: 'replay' },
              ]}
              value={deliveryMode}
            />
          </>
        ) : null}
        {rangeControls}
      </PageToolbar>
      {supportsExecutionFilters
      && !operationRequiresRobotCatalog
      && robots.status === 'loading' ? (
        <Spinner label="로봇 목록 불러오는 중" />
      ) : null}
      {supportsExecutionFilters
      && !operationRequiresRobotCatalog
      && robots.status === 'error' ? (
        <Panel title="로봇 목록을 불러오지 못했습니다">
          <ErrorMessage>
            전체 로봇 기준 운영 기록은 유지했습니다. 개별 로봇 필터를 사용할 수 없습니다. {robots.message}
          </ErrorMessage>
          <Button className="mt-4" onClick={robots.retry} variant="secondary">
            로봇 목록 다시 불러오기
          </Button>
        </Panel>
      ) : null}
      {supportsExecutionFilters ? null : (
        <p className="text-xs text-muted" role="status">
          데이터셋에는 단일 로봇·실행 환경·전달 방식이 없으므로 해당 필터와 로봇별 그룹을 적용하지 않습니다.
        </p>
      )}
      <p className="text-xs text-muted">
        24시간·7일·30일은 조회 시각까지의 이동 기간입니다. 사용자 지정 날짜와 시각 표시는 브라우저 시간대({getDisplayTimeZoneLabel()})를 사용합니다.
      </p>
      {invalidRangeFeedback}
      {hasInvalidRange ? null : (
        <>
          {result.isRefreshing ? (
            <QueryFeedback kind="loading" />
          ) : null}
          {!hasResultForCurrentMode ? null : operations.records.length === 0 ? (
            result.isRefreshing ? null : (
              <QueryFeedback kind="empty" message="조건에 맞는 운영 기록이 없습니다. 기간이나 필터를 조정해 보세요." />
            )
          ) : (
            <>
          <p className="text-sm text-muted" role="status">
            표시 중인 운영 기록 {String(operations.records.length)}건 전체를 내보내기에 반영하고, 표에는 현재 페이지 {String(pagedOperations.items.length)}건을 표시합니다.
          </p>
          {displayedOperationGroup === 'none' ? null : (
            <Panel title={`${displayedOperationGroup === 'robot' ? '로봇' : '상태'} 그룹 요약`}>
              <Table aria-label="운영 기록 그룹 요약">
                <TableHeader>
                  <TableRow><TableHead>그룹</TableHead><TableHead>기록</TableHead><TableHead>기록량</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {operations.groups.map((item, index) => (
                    <TableRow key={`${item.key === null ? 'null' : `value:${item.key}`}-${String(index)}`}>
                      <TableCell>
                        {item.key === null
                          ? displayedOperationGroup === 'robot'
                            ? '로봇 미지정'
                            : '그룹 값 미제공'
                          : displayedOperationGroup === 'status'
                            ? getRecordStatusLabel(item.key)
                            : item.key}
                      </TableCell>
                      <TableCell>{String(item.count)}건</TableCell>
                      <TableCell>{item.bytes === null ? '—' : formatBytes(item.bytes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          )}
          <Table aria-label="운영 기록 목록">
            <TableHeader>
              <TableRow>
                <TableHead>{getRecordTypeLabel(displayedOperationType)}</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>로봇</TableHead>
                <TableHead>출처</TableHead>
                <TableHead>시각</TableHead>
                <TableHead>기록량</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedOperations.items.map((record) => (
                <TableRow key={record.id}>
                  <TableCell><Link className="font-semibold underline" to={getRecordPath(record.type, record.id)}>{record.name}</Link></TableCell>
                  <TableCell>{getRecordStatusLabel(record.status)}</TableCell>
                  <TableCell>{record.robotId ?? '—'}</TableCell>
                  <TableCell>{record.provenance === null ? '—' : getExecutionProvenanceLabel(record.provenance)}</TableCell>
                  <TableCell>{formatDateTime(record.timestampMs)}</TableCell>
                  <TableCell>{record.bytes === null ? '—' : formatBytes(record.bytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            isPending={result.isRefreshing}
            onPageChange={(page) => update('page', String(page))}
            page={pagedOperations.page}
            pageSize={operationPageSize}
            totalItems={operations.records.length}
          />
            </>
          )}
        </>
      )}
    </div>
  );

  const chartData = telemetry.points.map((point) => ({
    label: new Date(point.timestampMs).toLocaleDateString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
    }),
    value: point.average,
  }));
  const telemetryContent = robots.robots.length === 0 ? (
    <QueryFeedback
      kind="empty"
      message="등록된 로봇이 없어 텔레메트리 집계를 조회할 수 없습니다."
    />
  ) : (
    <div className="grid gap-4">
      <PageToolbar aria-label="텔레메트리 집계 필터">
        <Select
          label="로봇"
          onValueChange={(value) => updateRobot('robotId', value)}
          options={robots.robots.map((robot) => ({
            label: robot.displayName,
            value: getRobotOptionValue(robot.id),
          }))}
          value={getRobotOptionValue(robotId)}
        />
        <Select
          label="채널"
          onValueChange={(value) => update('channel', value)}
          options={[
            { label: '위치 채널 집계값', value: 'pose' },
            { label: '배터리 채널 집계값', value: 'battery' },
          ]}
          value={channel}
        />
        {rangeControls}
        <Input
          label="집계 정보"
          readOnly
          value={result.isRefreshing
            ? '집계 갱신 중'
            : telemetry.displayedPointCount === 0
            ? '집계 결과 없음'
            : `${String(telemetry.bucketMs / 1000)}초 · ${String(telemetry.displayedPointCount)}개 표시`}
        />
      </PageToolbar>
      <p className="text-xs text-muted">날짜 기준: {getDisplayTimeZoneLabel()}</p>
      {invalidRangeFeedback}
      {hasInvalidRange ? null : (
        <>
          {result.isRefreshing ? (
            <QueryFeedback kind="loading" />
          ) : null}
          {!hasResultForCurrentMode ? null : telemetry.points.length === 0 ? (
            result.isRefreshing ? null : (
              <QueryFeedback kind="empty" message="조건에 맞는 텔레메트리 집계가 없습니다. 로봇과 기간을 확인해 보세요." />
            )
          ) : (
            <>
          <Panel title={`${getChannelLabel(displayedTelemetryChannel)} 집계`}>
            <Chart
              accessibleSummary={(
                <p>{displayedTelemetryRobotId} {getChannelLabel(displayedTelemetryChannel)} 집계 {String(telemetry.displayedPointCount)}개</p>
              )}
              data={chartData}
            />
          </Panel>
          <p className="text-sm text-muted">
            차트와 내보내기는 집계점 {String(telemetry.points.length)}개 전체를 사용하며, 표는 최근 {String(Math.min(20, telemetry.points.length))}개를 역순으로 표시합니다.
          </p>
          <Table aria-label="텔레메트리 집계점 목록">
            <TableHeader>
              <TableRow>
                <TableHead>시각</TableHead>
                <TableHead>평균</TableHead>
                <TableHead>최소</TableHead>
                <TableHead>최대</TableHead>
                <TableHead>샘플 수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {telemetry.points.slice(-20).reverse().map((point) => (
                <TableRow key={point.timestampMs}>
                  <TableCell>{formatDateTime(point.timestampMs)}</TableCell>
                  <TableCell>{point.average.toFixed(3)}</TableCell>
                  <TableCell>{point.minimum.toFixed(3)}</TableCell>
                  <TableCell>{point.maximum.toFixed(3)}</TableCell>
                  <TableCell>{String(point.sampleCount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={(
          <Dropdown
            items={[
              {
                disabled: exportDisabled,
                label: 'CSV 내보내기',
                onSelect: () => exportResults('csv'),
              },
              {
                disabled: exportDisabled,
                label: 'JSON 내보내기',
                onSelect: () => exportResults('json'),
              },
            ]}
            label="데이터 탐색 결과 내보내기"
            trigger={(
              <Button
                disabled={exportDisabled}
                isLoading={recordExport.isExporting}
                variant="secondary"
              >
                <Icon name="download" />내보내기
              </Button>
            )}
          />
        )}
        title="데이터 탐색"
      />
      {result.refreshError === null ? null : (
        <Panel title="최신 탐색 결과를 반영하지 못했습니다">
          <ErrorMessage>
            {hasResultForCurrentMode
              ? '마지막으로 성공한 조건의 결과를 유지했습니다.'
              : '현재 탭의 결과를 불러오지 못했습니다.'}{' '}
            {result.refreshError}
          </ErrorMessage>
          <Button className="mt-4" onClick={result.retry} variant="secondary">다시 불러오기</Button>
        </Panel>
      )}
      {recordExport.error === null ? null : (
        <ErrorMessage>
          {recordExport.error}
        </ErrorMessage>
      )}
      <Tabs
        items={[
          { value: 'operations', label: '운영 기록', content: operationsContent },
          { value: 'telemetry', label: '텔레메트리 집계', content: telemetryContent },
        ]}
        onValueChange={(value) => update('mode', value)}
        value={mode}
      />
    </div>
  );
}
