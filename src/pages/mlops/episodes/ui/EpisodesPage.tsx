import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  useEpisodeRepository,
  type EpisodeQuery,
} from '@/entities/episode';
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
import { formatBytes, formatDateTime, formatDuration } from '@/shared/lib/format';
import { appendPathSegment } from '@/shared/lib/navigation';
import {
  useRecordExport,
  type ExportRecord,
  type RecordExportFormat,
} from '@/shared/lib/record-export';
import { collectAllPages } from '@/shared/lib/query';
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

const environmentValues = ['all', 'physical', 'simulation'] as const;
const deliveryModeValues = ['all', 'live', 'replay'] as const;
const sortValues: readonly EpisodeQuery['sort'][] = [
  'newest',
  'oldest',
  'bytes-desc',
  'duration-desc',
];

export function EpisodesPage() {
  const repository = useEpisodeRepository();
  const robots = useRobotCatalog();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
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
  const sort = readAllowedValue(params.get('sort'), sortValues, 'newest');
  const requestedPage = readPositivePage(params.get('page'));
  const exportScopeKey = createRecordSetSearchKey(params);
  const exportScopeKeyRef = useRef(exportScopeKey);
  useLayoutEffect(() => {
    exportScopeKeyRef.current = exportScopeKey;
  }, [exportScopeKey]);
  const query = useMemo<EpisodeQuery>(() => ({
    search,
    robotId: requestedRobotId,
    environment: environment === 'all' ? null : environment,
    deliveryMode: deliveryMode === 'all'
      ? null
      : deliveryMode,
    sort,
    page: requestedPage,
    pageSize,
  }), [deliveryMode, environment, requestedPage, requestedRobotId, search, sort]);
  const canQueryEpisodes = !hasExplicitRobotFilter
    || (robots.status === 'ready' && !hasInvalidRobotFilter);
  const loadEpisodes = useCallback(
    () => canQueryEpisodes
      ? repository.queryEpisodes(query)
      : Promise.reject(new Error('로봇 필터를 확인할 때까지 에피소드 조회를 보류합니다.')),
    [canQueryEpisodes, query, repository],
  );
  const subscribeEpisodes = useCallback(
    (listener: () => void) => repository.subscribe(listener),
    [repository],
  );
  const episodes = useAsyncQuery(
    loadEpisodes,
    canQueryEpisodes ? subscribeEpisodes : undefined,
    { retainPreviousData: true },
  );
  const recordExport = useRecordExport();
  const exportDisabled = episodes.isRefreshing
    || episodes.refreshError !== null
    || recordExport.isExporting;

  function update(key: string, value: string): void {
    const next = new URLSearchParams(params);
    if (value === '' || (value === 'all' && key !== 'search')) next.delete(key);
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

  function exportEpisodes(format: RecordExportFormat): void {
    if (exportDisabled) return;
    const isCurrent = () => exportScopeKeyRef.current === exportScopeKey;
    void recordExport.start({
      baseFileName: 'episodes',
      format,
      isCurrent,
      subscribeInvalidation: (listener) => repository.subscribe(listener),
      loadRecords: async () => {
        const items = await collectAllPages(
          query,
          (pageQuery) => repository.queryEpisodes(pageQuery),
          { getKey: (episode) => episode.id, isCurrent },
        );
        return items.map((episode): ExportRecord => ({
          id: episode.id,
          name: episode.name,
          sessionId: episode.captureSessionId,
          robotId: episode.robotId,
          sensorDeviceId: episode.sensorDeviceId,
          integrationProfileId: episode.integrationProfileId,
          environment: episode.provenance.environment,
          deliveryMode: episode.provenance.deliveryMode,
          controlMode: episode.provenance.controlMode,
          dataOrigin: episode.provenance.dataOrigin,
          durationMs: episode.durationMs,
          bytesWritten: episode.bytesWritten,
          streamCount: episode.streams.length,
          createdAt: new Date(episode.createdAtMs).toISOString(),
        }));
      },
    });
  }

  if (
    episodes.status === 'loading'
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
        <PageHeader title="에피소드" />
        <Panel title="로봇 필터를 적용하지 않았습니다">
          <ErrorMessage>등록 목록에 없는 로봇 ID입니다: {requestedRobotId}</ErrorMessage>
          <Button className="mt-4" onClick={() => updateRobot(allRobotsOptionValue)} variant="secondary">
            전체 로봇 보기
          </Button>
        </Panel>
      </div>
    );
  }
  if (episodes.status === 'error') {
    return <QueryFeedback kind="error" message={episodes.message} onRetry={episodes.retry} />;
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={(
          <Dropdown
            items={[
              { disabled: exportDisabled, label: 'CSV 내보내기', onSelect: () => exportEpisodes('csv') },
              { disabled: exportDisabled, label: 'JSON 내보내기', onSelect: () => exportEpisodes('json') },
            ]}
            label="에피소드 내보내기"
            trigger={<Button disabled={exportDisabled} isLoading={recordExport.isExporting} variant="secondary"><Icon name="download" />내보내기</Button>}
          />
        )}
        title="에피소드"
      />
      {robots.status === 'error' ? (
        <Panel title="로봇 필터를 불러오지 못했습니다">
          <ErrorMessage>
            에피소드 결과는 유지했지만 로봇별 필터를 사용할 수 없습니다. {robots.message}
          </ErrorMessage>
          <Button className="mt-4" onClick={robots.retry} variant="secondary">
            로봇 목록 다시 불러오기
          </Button>
        </Panel>
      ) : robots.status === 'loading' ? (
        <Spinner label="로봇 필터 불러오는 중" />
      ) : null}
      {episodes.refreshError === null ? null : (
        <Panel title="최신 에피소드를 반영하지 못했습니다">
          <ErrorMessage>기존 결과를 유지했습니다. {episodes.refreshError}</ErrorMessage>
          <Button className="mt-4" onClick={episodes.retry} variant="secondary">다시 불러오기</Button>
        </Panel>
      )}
      {recordExport.error === null ? null : <ErrorMessage>{recordExport.error}</ErrorMessage>}
      <PageToolbar aria-label="에피소드 필터">
          <SearchField
            label="에피소드 검색"
            onValueChange={(value) => update('search', value)}
            placeholder="이름 또는 ID"
            value={search}
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
          <Select
            label="정렬"
            onValueChange={(value) => update('sort', value)}
            options={[
              { label: '최신순', value: 'newest' },
              { label: '오래된 순', value: 'oldest' },
              { label: '기록량 많은 순', value: 'bytes-desc' },
              { label: '길이 긴 순', value: 'duration-desc' },
            ]}
            value={sort}
          />
      </PageToolbar>

      <DataView
        footer={episodes.data.items.length === 0 ? undefined : (
          <Pagination
            isPending={episodes.isRefreshing}
            onPageChange={(value) => update('page', String(value))}
            page={episodes.data.page}
            pageSize={episodes.data.pageSize}
            totalItems={episodes.data.totalItems}
          />
        )}
        message="조건에 맞는 에피소드가 없습니다."
        state={episodes.data.items.length === 0 && !episodes.isRefreshing ? 'empty' : 'ready'}
      >
        {episodes.isRefreshing ? <QueryFeedback kind="loading" /> : null}
        {episodes.data.items.length === 0 ? null : (
          <Table aria-label="에피소드 목록">
            <TableHeader>
              <TableRow>
                <TableHead>에피소드</TableHead>
                <TableHead>로봇</TableHead>
                <TableHead>출처</TableHead>
                <TableHead>수집 세션</TableHead>
                <TableHead>생성 시각</TableHead>
                <TableHead>길이</TableHead>
                <TableHead>기록량</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {episodes.data.items.map((episode) => (
                <TableRow key={episode.id}>
                  <TableCell>
                    <Link className="font-semibold underline" to={appendPathSegment('/mlops/episodes', episode.id)}>
                      {episode.name}
                    </Link>
                    <span className="block text-xs text-muted">{episode.id}</span>
                  </TableCell>
                  <TableCell>{episode.robotId}</TableCell>
                  <TableCell>{getExecutionProvenanceLabel(episode.provenance)}</TableCell>
                  <TableCell>
                    <Link className="underline" to={appendPathSegment('/mlops/sessions', episode.captureSessionId)}>
                      {episode.captureSessionId}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDateTime(episode.createdAtMs)}</TableCell>
                  <TableCell>{formatDuration(episode.durationMs)}</TableCell>
                  <TableCell>{formatBytes(episode.bytesWritten)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataView>
    </div>
  );
}
