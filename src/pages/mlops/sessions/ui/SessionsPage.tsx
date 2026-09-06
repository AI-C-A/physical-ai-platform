import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  getCaptureSessionStatusLabel,
  useCaptureOperationsPort,
  type CaptureSessionQuery,
  type CaptureSessionStatus,
} from '@/entities/capture-session';
import { useRobotCatalog } from '@/entities/robot';
import {
  getDeliveryModeLabel,
  getExecutionEnvironmentLabel,
  getExecutionProvenanceLabel,
} from '@/shared/domain';
import {
  createRecordSetSearchKey,
  readAllowedValue,
  readPositivePage,
} from '@/shared/lib/collection-query';
import { useAsyncQuery } from '@/shared/lib/async-query';
import { useClock } from '@/shared/lib/clock';
import { formatBytes, formatDateTime } from '@/shared/lib/format';
import { appendPathSegment } from '@/shared/lib/navigation';
import {
  useRecordExport,
  type ExportRecord,
  type RecordExportFormat,
} from '@/shared/lib/record-export';
import { collectAllPages } from '@/shared/lib/query';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataView } from '@/shared/ui/data-view';
import { Dropdown } from '@/shared/ui/dropdown';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Icon } from '@/shared/ui/icon';
import { SearchField } from '@/shared/ui/search-field';
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

const pageSize = 20;
const allRobotsOptionValue = 'all-robots';
const robotOptionValuePrefix = 'robot:';

function getRobotOptionValue(robotId: string): string {
  return `${robotOptionValuePrefix}${robotId}`;
}

const sessionStatuses: readonly CaptureSessionStatus[] = [
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
const statusValues = ['all', ...sessionStatuses] as const;
const environmentValues = ['all', 'physical', 'simulation'] as const;
const deliveryModeValues = ['all', 'live', 'replay'] as const;
const rangeValues = ['1', '7', '30', 'all'] as const;
const sortValues: readonly CaptureSessionQuery['sort'][] = [
  'newest',
  'oldest',
  'name-asc',
  'bytes-desc',
];

export function SessionsPage() {
  const operations = useCaptureOperationsPort();
  const robots = useRobotCatalog();
  const clock = useClock();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = readAllowedValue(params.get('status'), statusValues, 'all');
  const requestedRobotId = params.get('robotId');
  const hasExplicitRobotFilter = requestedRobotId !== null;
  const robotOptionValue = requestedRobotId === null
    ? allRobotsOptionValue
    : getRobotOptionValue(requestedRobotId);
  const hasInvalidRobotFilter = robots.status === 'ready'
    && hasExplicitRobotFilter
    && !robots.robots.some((robot) => robot.id === requestedRobotId);
  const environment = readAllowedValue(
    params.get('environment'),
    environmentValues,
    'all',
  );
  const deliveryMode = readAllowedValue(
    params.get('deliveryMode'),
    deliveryModeValues,
    'all',
  );
  const range = readAllowedValue(params.get('range'), rangeValues, '30');
  const sort = readAllowedValue(params.get('sort'), sortValues, 'newest');
  const requestedPage = readPositivePage(params.get('page'));
  const exportScopeKey = createRecordSetSearchKey(params);
  const exportScopeKeyRef = useRef(exportScopeKey);
  useLayoutEffect(() => {
    exportScopeKeyRef.current = exportScopeKey;
  }, [exportScopeKey]);
  const rangeAnchorKey = useMemo(
    () => JSON.stringify([
      search,
      status,
      requestedRobotId,
      environment,
      deliveryMode,
      range,
      sort,
    ]),
    [deliveryMode, environment, range, requestedRobotId, search, sort, status],
  );
  const rangeAnchorRef = useRef<{ readonly key: string; readonly endMs: number } | null>(null);
  const getRangeAnchorMs = useCallback(() => {
    if (rangeAnchorRef.current?.key !== rangeAnchorKey) {
      rangeAnchorRef.current = { key: rangeAnchorKey, endMs: clock.nowMs() };
    }
    return rangeAnchorRef.current.endMs;
  }, [clock, rangeAnchorKey]);
  const resetRangeAnchor = useCallback(() => {
    rangeAnchorRef.current = { key: rangeAnchorKey, endMs: clock.nowMs() };
  }, [clock, rangeAnchorKey]);
  const queryTemplate = useMemo<CaptureSessionQuery>(() => ({
    search,
    status: status === 'all' ? null : status,
    robotId: requestedRobotId,
    environment: environment === 'all'
      ? null
      : environment,
    deliveryMode: deliveryMode === 'all'
      ? null
      : deliveryMode,
    startMs: null,
    sort,
    page: requestedPage,
    pageSize,
  }), [
    deliveryMode,
    environment,
    requestedPage,
    requestedRobotId,
    search,
    sort,
    status,
  ]);
  const executedQueryRef = useRef<CaptureSessionQuery | null>(null);
  const canQuerySessions = !hasExplicitRobotFilter
    || (robots.status === 'ready' && !hasInvalidRobotFilter);
  const loadSessions = useCallback(
    () => {
      if (!canQuerySessions) {
        return Promise.reject(new Error('로봇 필터를 확인할 때까지 수집 세션 조회를 보류합니다.'));
      }
      const executedQuery: CaptureSessionQuery = {
        ...queryTemplate,
        startMs: range === 'all'
          ? null
          : getRangeAnchorMs() - Number(range) * 86_400_000,
      };
      executedQueryRef.current = executedQuery;
      return operations.querySessions(executedQuery);
    },
    [canQuerySessions, getRangeAnchorMs, operations, queryTemplate, range],
  );
  const subscribeSessions = useCallback(
    (listener: () => void) => operations.subscribeSessions(() => {
      resetRangeAnchor();
      listener();
    }),
    [operations, resetRangeAnchor],
  );
  const sessions = useAsyncQuery(
    loadSessions,
    canQuerySessions ? subscribeSessions : undefined,
    { retainPreviousData: true },
  );
  const recordExport = useRecordExport();
  const exportDisabled = sessions.isRefreshing
    || sessions.refreshError !== null
    || recordExport.isExporting;

  function retrySessions(): void {
    resetRangeAnchor();
    sessions.retry();
  }

  function updateParam(key: string, value: string): void {
    const next = new URLSearchParams(params);
    if (
      value === ''
      || (value === 'all' && key !== 'search' && key !== 'range')
    ) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  function updateRobot(value: string): void {
    const next = new URLSearchParams(params);
    if (value === allRobotsOptionValue) {
      next.delete('robotId');
    } else if (value.startsWith(robotOptionValuePrefix)) {
      next.set('robotId', value.slice(robotOptionValuePrefix.length));
    } else {
      return;
    }
    next.delete('page');
    setParams(next);
  }

  function exportSessions(format: RecordExportFormat): void {
    if (exportDisabled) return;
    const isCurrent = () => exportScopeKeyRef.current === exportScopeKey;
    void recordExport.start({
      baseFileName: 'capture-sessions',
      format,
      isCurrent,
      subscribeInvalidation: (listener) =>
        operations.subscribeSessions(listener),
      loadRecords: async () => {
        const executedQuery = executedQueryRef.current;
        if (executedQuery === null) {
          throw new Error('현재 화면의 수집 세션 조회 조건을 확인할 수 없습니다.');
        }
        const items = await collectAllPages(
          executedQuery,
          (pageQuery) => operations.querySessions(pageQuery),
          { getKey: (session) => session.id, isCurrent },
        );
        return items.map((session): ExportRecord => ({
          id: session.id,
          name: session.name,
          robotId: session.robotId,
          sensorDeviceId: session.sensorDeviceId,
          integrationProfileId: session.integrationProfileId,
          status: session.status,
          environment: session.provenance.environment,
          deliveryMode: session.provenance.deliveryMode,
          controlMode: session.provenance.controlMode,
          dataOrigin: session.provenance.dataOrigin,
          bytesWritten: session.bytesWritten,
          streamCount: session.streams.length,
          episodeId: session.episodeId,
          lastError: session.lastError,
          createdAt: new Date(session.createdAtMs).toISOString(),
          startedAt: session.startedAtMs === null
            ? null
            : new Date(session.startedAtMs).toISOString(),
          stoppedAt: session.stoppedAtMs === null
            ? null
            : new Date(session.stoppedAtMs).toISOString(),
          completedAt: session.completedAtMs === null
            ? null
            : new Date(session.completedAtMs).toISOString(),
        }));
      },
    });
  }

  if (
    sessions.status === 'loading'
    || (hasExplicitRobotFilter && robots.status === 'loading')
  ) {
    return <QueryFeedback kind="loading" />;
  }
  if (hasExplicitRobotFilter && robots.status === 'error') {
    return <QueryFeedback kind="error" message={robots.message} onRetry={robots.retry} />;
  }
  if (hasInvalidRobotFilter) {
    return (
      <div className="grid gap-6">
        <PageHeader title="수집 세션" />
        <Panel title="로봇 필터를 적용하지 않았습니다">
          <ErrorMessage>등록 목록에 없는 로봇 ID입니다: {requestedRobotId}</ErrorMessage>
          <Button className="mt-4" onClick={() => updateRobot(allRobotsOptionValue)} variant="secondary">
            전체 로봇 보기
          </Button>
        </Panel>
      </div>
    );
  }
  if (sessions.status === 'error') {
    return <QueryFeedback kind="error" message={sessions.message} onRetry={retrySessions} />;
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={(
          <Dropdown
            items={[
              { disabled: exportDisabled, label: 'CSV 내보내기', onSelect: () => exportSessions('csv') },
              { disabled: exportDisabled, label: 'JSON 내보내기', onSelect: () => exportSessions('json') },
            ]}
            label="수집 세션 내보내기"
            trigger={<Button disabled={exportDisabled} isLoading={recordExport.isExporting} variant="secondary"><Icon name="download" />내보내기</Button>}
          />
        )}
        title="수집 세션"
      />
      {robots.status === 'error' ? (
        <Panel title="로봇 필터를 불러오지 못했습니다">
          <ErrorMessage>
            수집 세션 결과는 유지했지만 로봇별 필터를 사용할 수 없습니다. {robots.message}
          </ErrorMessage>
          <Button className="mt-4" onClick={robots.retry} variant="secondary">
            로봇 목록 다시 불러오기
          </Button>
        </Panel>
      ) : robots.status === 'loading' ? (
        <Spinner label="로봇 필터 불러오는 중" />
      ) : null}
      {sessions.refreshError === null ? null : (
        <Panel title="최신 수집 세션을 반영하지 못했습니다">
          <ErrorMessage>기존 결과를 유지했습니다. {sessions.refreshError}</ErrorMessage>
          <Button className="mt-4" onClick={retrySessions} variant="secondary">다시 불러오기</Button>
        </Panel>
      )}
      {recordExport.error === null ? null : <ErrorMessage>{recordExport.error}</ErrorMessage>}
      <PageToolbar aria-label="수집 세션 필터">
          <SearchField
            label="수집 세션 검색"
            onValueChange={(value) => updateParam('search', value)}
            placeholder="이름 또는 ID"
            value={search}
          />
          <Select
            label="상태"
            onValueChange={(value) => updateParam('status', value)}
            options={[
              { label: '전체', value: 'all' },
              ...sessionStatuses.map((value) => ({
                label: getCaptureSessionStatusLabel(value),
                value,
              })),
            ]}
            value={status}
          />
          <Select
            disabled={robots.status !== 'ready'}
            label="로봇"
            onValueChange={updateRobot}
            options={[
              { label: '전체', value: allRobotsOptionValue },
              ...robots.robots.map((robot) => ({
                label: robot.displayName,
                value: getRobotOptionValue(robot.id),
              })),
            ]}
            value={robotOptionValue}
          />
          <Select
            label="기간"
            onValueChange={(value) => updateParam('range', value)}
            options={[
              { label: '24시간', value: '1' },
              { label: '7일', value: '7' },
              { label: '30일', value: '30' },
              { label: '전체', value: 'all' },
            ]}
            value={range}
          />
          <Select
            label="실행 환경"
            onValueChange={(value) => updateParam('environment', value)}
            options={[
              { label: '전체', value: 'all' },
              { label: getExecutionEnvironmentLabel('physical'), value: 'physical' },
              { label: getExecutionEnvironmentLabel('simulation'), value: 'simulation' },
            ]}
            value={environment}
          />
          <Select
            label="전달 방식"
            onValueChange={(value) => updateParam('deliveryMode', value)}
            options={[
              { label: '전체', value: 'all' },
              { label: getDeliveryModeLabel('live'), value: 'live' },
              { label: getDeliveryModeLabel('replay'), value: 'replay' },
            ]}
            value={deliveryMode}
          />
          <Select
            label="정렬"
            onValueChange={(value) => updateParam('sort', value)}
            options={[
              { label: '최신순', value: 'newest' },
              { label: '오래된 순', value: 'oldest' },
              { label: '이름순', value: 'name-asc' },
              { label: '기록량 많은 순', value: 'bytes-desc' },
            ]}
            value={sort}
          />
      </PageToolbar>

      <DataView
        footer={sessions.data.items.length === 0 ? undefined : (
          <Pagination
            isPending={sessions.isRefreshing}
            onPageChange={(value) => updateParam('page', String(value))}
            page={sessions.data.page}
            pageSize={sessions.data.pageSize}
            totalItems={sessions.data.totalItems}
          />
        )}
        message="조건에 맞는 수집 세션이 없습니다."
        state={sessions.data.items.length === 0 && !sessions.isRefreshing ? 'empty' : 'ready'}
      >
        {sessions.isRefreshing ? <QueryFeedback kind="loading" /> : null}
        {sessions.data.items.length === 0 ? null : (
          <Table aria-label="수집 세션 목록">
            <TableHeader>
              <TableRow>
                <TableHead>수집 세션</TableHead>
                <TableHead>로봇</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>출처</TableHead>
                <TableHead>생성 시각</TableHead>
                <TableHead>기록량</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.data.items.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <Link className="font-semibold underline" to={appendPathSegment('/mlops/sessions', session.id)}>
                      {session.name}
                    </Link>
                    <span className="block text-xs text-muted">{session.id}</span>
                  </TableCell>
                  <TableCell>{session.robotId}</TableCell>
                  <TableCell>
                    <Badge
                      tone={session.status === 'completed'
                        ? 'positive'
                        : session.status === 'failed' || session.status === 'interrupted'
                          ? 'negative'
                          : 'info'}
                    >
                      {getCaptureSessionStatusLabel(session.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{getExecutionProvenanceLabel(session.provenance)}</TableCell>
                  <TableCell>{formatDateTime(session.createdAtMs)}</TableCell>
                  <TableCell>{formatBytes(session.bytesWritten)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataView>
    </div>
  );
}
