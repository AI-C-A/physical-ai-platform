import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  useRobotCatalogPort,
  useRobotOperationalStatuses,
  useRobotQuery,
  RobotOfflineNotice,
  type RobotQuery,
} from '@/entities/robot';
import {
  createRecordSetSearchKey,
  readAllowedValue,
  readPositivePage,
} from '@/shared/lib/collection-query';
import {
  useRecordExport,
  type ExportRecord,
  type RecordExportFormat,
} from '@/shared/lib/record-export';
import { appendPathSegment } from '@/shared/lib/navigation';
import { collectAllPages } from '@/shared/lib/query';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dropdown } from '@/shared/ui/dropdown';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
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
const sortValues: readonly RobotQuery['sort'][] = [
  'name-asc',
  'name-desc',
];

export function RobotsPage() {
  const catalogPort = useRobotCatalogPort();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const sort = readAllowedValue(params.get('sort'), sortValues, 'name-asc');
  const requestedPage = readPositivePage(params.get('page'));
  const exportScopeKey = createRecordSetSearchKey(params);
  const exportScopeKeyRef = useRef(exportScopeKey);
  useLayoutEffect(() => {
    exportScopeKeyRef.current = exportScopeKey;
  }, [exportScopeKey]);
  useEffect(() => {
    if (!params.has('status')) return;
    const next = new URLSearchParams(params);
    next.delete('status');
    setParams(next, { replace: true });
  }, [params, setParams]);
  const query = useMemo<RobotQuery>(
    () => ({
      search,
      sort,
      page: requestedPage,
      pageSize,
    }),
    [requestedPage, search, sort],
  );
  const robots = useRobotQuery(query);
  const robotIds = useMemo(
    () =>
      robots.status === 'ready'
        ? robots.data.items.map((robot) => robot.id)
        : [],
    [robots],
  );
  const operationalStatuses = useRobotOperationalStatuses(robotIds);
  const recordExport = useRecordExport();

  if (robots.status === 'loading') {
    return (
      <QueryFeedback kind="loading" />
    );
  }
  if (robots.status === 'error') {
    return (
      <QueryFeedback
        kind="error"
        message={robots.message}
        onRetry={robots.retry}
      />
    );
  }

  const pageItems = robots.data.items;
  const exportDisabled = robots.isRefreshing
    || robots.refreshError !== null
    || recordExport.isExporting;

  function updateParam(key: string, value: string): void {
    const next = new URLSearchParams(params);
    if (value === '' || (value === 'all' && key !== 'search')) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  function exportRobots(format: RecordExportFormat): void {
    if (exportDisabled) return;
    const isCurrent = () => exportScopeKeyRef.current === exportScopeKey;
    void recordExport.start({
      baseFileName: 'robots',
      format,
      isCurrent,
      loadRecords: async () => {
        const items = await collectAllPages(
          query,
          (pageQuery) => catalogPort.queryRobots(pageQuery),
          { getKey: (robot) => robot.id, isCurrent },
        );
        return items.map((robot): ExportRecord => ({
          id: robot.id,
          serialNumber: robot.serialNumber,
          name: robot.displayName,
        }));
      },
    });
  }

  const showOfflineNotice = operationalStatuses.status === 'ready'
    && operationalStatuses.streamStatus === 'stale';
  const statusIndicatorLabel = operationalStatuses.status === 'error'
    ? '운영 상태: 조회 오류'
    : operationalStatuses.status === 'loading'
      ? '운영 상태: 조회 중'
      : operationalStatuses.streamStatus === 'online'
        ? '실시간 상태: 온라인'
        : operationalStatuses.streamStatus === 'connecting'
          ? '실시간 상태: 연결 중'
          : '운영 상태: 조회 완료';
  const statusIndicatorText = operationalStatuses.status === 'error'
    ? '조회 오류'
    : operationalStatuses.status === 'loading'
      ? '조회 중'
      : operationalStatuses.streamStatus === 'online'
        ? '온라인'
        : operationalStatuses.streamStatus === 'connecting'
          ? '연결 중'
          : '조회 완료';
  const statusIndicatorTone = operationalStatuses.status === 'error'
    ? 'negative'
    : operationalStatuses.streamStatus === 'online'
      ? 'positive'
      : operationalStatuses.streamStatus === 'unavailable'
        ? 'neutral'
        : 'warning';
  const statusIndicatorPending = operationalStatuses.status === 'loading'
    || operationalStatuses.streamStatus === 'connecting';

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showOfflineNotice ? (
              <RobotOfflineNotice onReconnect={operationalStatuses.retry} />
            ) : (
              <span
                aria-atomic="true"
                aria-label={statusIndicatorLabel}
                role="status"
              >
                <Badge tone={statusIndicatorTone}>
                  {statusIndicatorPending ? (
                    <>
                      <Spinner />
                      {statusIndicatorText}
                    </>
                  ) : statusIndicatorText}
                </Badge>
              </span>
            )}
            <Dropdown
              items={[
                {
                  disabled: exportDisabled,
                  label: 'CSV 내보내기',
                  onSelect: () => exportRobots('csv'),
                },
                {
                  disabled: exportDisabled,
                  label: 'JSON 내보내기',
                  onSelect: () => exportRobots('json'),
                },
              ]}
              label="로봇 내보내기"
              trigger={
                <Button disabled={exportDisabled} isLoading={recordExport.isExporting} variant="secondary">
                  <Icon name="download" />
                  내보내기
                </Button>
              }
            />
          </div>
        }
        title="로봇 관리"
      />
      {robots.refreshError === null ? null : (
        <Panel title="최신 로봇 목록을 반영하지 못했습니다">
          <ErrorMessage>기존 결과를 유지했습니다. {robots.refreshError}</ErrorMessage>
          <Button className="mt-4" onClick={robots.retry} variant="secondary">다시 불러오기</Button>
        </Panel>
      )}
      {recordExport.error === null ? null : <ErrorMessage>{recordExport.error}</ErrorMessage>}
      {operationalStatuses.status === 'error' ? (
        <QueryFeedback
          kind="error"
          message={operationalStatuses.message}
          onRetry={operationalStatuses.retry}
        />
      ) : null}
      <Panel>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="로봇 검색"
            onChange={(event) => updateParam('search', event.target.value)}
            placeholder="이름 또는 ID"
            value={search}
          />
          <Select
            label="정렬"
            onValueChange={(value) => updateParam('sort', value)}
            options={[
              { label: '이름 오름차순', value: 'name-asc' },
              { label: '이름 내림차순', value: 'name-desc' },
            ]}
            value={sort}
          />
        </div>
      </Panel>
      {robots.isRefreshing ? (
        <QueryFeedback kind="loading" />
      ) : null}
      {pageItems.length === 0 ? (
        robots.isRefreshing ? null : (
          <QueryFeedback kind="empty" message="조건에 맞는 로봇이 없습니다." />
        )
      ) : (
        <>
          <Table aria-label="로봇 목록">
            <TableHeader>
              <TableRow>
                <TableHead>로봇</TableHead>
                <TableHead>플랫폼 연결 상태</TableHead>
                <TableHead>일련번호</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((robot) => {
                const operationalStatus = operationalStatuses.status === 'ready'
                  ? operationalStatuses.data[robot.id]
                  : undefined;
                return (
                  <TableRow key={robot.id}>
                    <TableCell>
                      <Link
                        className="font-semibold underline"
                        to={appendPathSegment('/control/monitoring', robot.id)}
                      >
                        {robot.displayName}
                      </Link>
                      <span className="block text-xs text-neutral-500">
                        {robot.id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={
                          operationalStatus === undefined || operationalStatus === null
                            ? 'neutral'
                            : operationalStatus.data.isConnecting
                              ? 'positive'
                              : 'negative'
                        }
                      >
                        {operationalStatus === undefined
                          ? <Spinner label="상태 조회 중" />
                          : operationalStatus === null
                            ? '상태 없음'
                            : operationalStatus.data.isConnecting
                              ? '온라인'
                              : '오프라인'}
                      </Badge>
                    </TableCell>
                    <TableCell>{robot.serialNumber ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            isPending={robots.isRefreshing}
            onPageChange={(value) => updateParam('page', String(value))}
            page={robots.data.page}
            pageSize={robots.data.pageSize}
            totalItems={robots.data.totalItems}
          />
        </>
      )}
    </div>
  );
}
