import { useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  getDatasetStatusLabel,
  useDatasetQuery,
  useDatasetRepository,
  type DatasetQuery,
} from '@/entities/dataset';
import {
  createRecordSetSearchKey,
  readAllowedValue,
  readPositivePage,
} from '@/shared/lib/collection-query';
import { formatDateTime } from '@/shared/lib/format';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

const pageSize = 20;
const sortValues: readonly DatasetQuery['sort'][] = [
  'updated-desc',
  'updated-asc',
  'name-asc',
  'episodes-desc',
];

export function DatasetsPage() {
  const repository = useDatasetRepository();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const search = params.get('search') ?? '';
  const tag = params.get('tag') ?? '';
  const sort = readAllowedValue(
    params.get('sort'),
    sortValues,
    'updated-desc',
  );
  const requestedPage = readPositivePage(params.get('page'));
  const exportScopeKey = createRecordSetSearchKey(params);
  const exportScopeKeyRef = useRef(exportScopeKey);
  useLayoutEffect(() => {
    exportScopeKeyRef.current = exportScopeKey;
  }, [exportScopeKey]);
  const query = useMemo<DatasetQuery>(
    () => ({
      search,
      tag: tag === '' ? null : tag,
      sort,
      page: requestedPage,
      pageSize,
    }),
    [requestedPage, search, sort, tag],
  );
  const datasets = useDatasetQuery(query);
  const recordExport = useRecordExport();
  const exportDisabled = datasets.isRefreshing
    || datasets.refreshError !== null
    || recordExport.isExporting;

  function update(key: string, value: string): void {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  function exportDatasets(format: RecordExportFormat): void {
    if (exportDisabled) return;
    const isCurrent = () => exportScopeKeyRef.current === exportScopeKey;
    void recordExport.start({
      baseFileName: 'datasets',
      format,
      isCurrent,
      subscribeInvalidation: (listener) => repository.subscribe(listener),
      loadRecords: async () => {
        const items = await collectAllPages(
          query,
          (pageQuery) => repository.queryDatasets(pageQuery),
          { getKey: (dataset) => dataset.id, isCurrent },
        );
        return items.map((dataset): ExportRecord => ({
          id: dataset.id,
          name: dataset.name,
          description: dataset.description,
          status: dataset.status,
          tags: dataset.tags,
          episodeCount: dataset.episodeIds.length,
          episodeIds: dataset.episodeIds,
          createdAt: new Date(dataset.createdAtMs).toISOString(),
          updatedAt: new Date(dataset.updatedAtMs).toISOString(),
        }));
      },
    });
  }

  if (datasets.status === 'loading') {
    return <QueryFeedback kind="loading" />;
  }
  if (datasets.status === 'error') {
    return <QueryFeedback kind="error" message={datasets.message} onRetry={datasets.retry} />;
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Dropdown
              items={[
                {
                  disabled: exportDisabled,
                  label: 'CSV 내보내기',
                  onSelect: () => {
                    exportDatasets('csv');
                  },
                },
                {
                  disabled: exportDisabled,
                  label: 'JSON 내보내기',
                  onSelect: () => {
                    exportDatasets('json');
                  },
                },
              ]}
              label="데이터셋 내보내기"
              trigger={
                <Button disabled={exportDisabled} isLoading={recordExport.isExporting} variant="secondary">
                  <Icon name="download" />
                  내보내기
                </Button>
              }
            />
            <Button
              onClick={() => {
                void navigate('/mlops/datasets/new');
              }}
            >
              초안 데이터셋 생성
            </Button>
          </div>
        }
        title="데이터셋"
      />
      {datasets.refreshError === null ? null : (
        <Panel title="최신 데이터셋을 반영하지 못했습니다">
          <ErrorMessage>기존 결과를 유지했습니다. {datasets.refreshError}</ErrorMessage>
          <Button className="mt-4" onClick={datasets.retry} variant="secondary">다시 불러오기</Button>
        </Panel>
      )}
      {recordExport.error === null ? null : <ErrorMessage>{recordExport.error}</ErrorMessage>}

      <PageToolbar aria-label="데이터셋 검색 및 정렬">
          <SearchField
            label="데이터셋 또는 태그 검색"
            onValueChange={(value) => update('search', value)}
            placeholder="이름, ID, 설명 또는 태그"
            value={search}
          />
          <SearchField
            label="정확히 일치하는 태그"
            onValueChange={(value) => update('tag', value)}
            placeholder="비워 두면 전체 태그"
            value={tag}
          />
          <Select
            label="정렬"
            onValueChange={(value) => update('sort', value)}
            options={[
              { label: '최근 수정순', value: 'updated-desc' },
              { label: '오래된 수정순', value: 'updated-asc' },
              { label: '이름순', value: 'name-asc' },
              { label: '에피소드 많은 순', value: 'episodes-desc' },
            ]}
            value={sort}
          />
      </PageToolbar>

      <section aria-labelledby="dataset-list-title" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold" id="dataset-list-title">
              데이터셋 목록
            </h2>
            <p className="mt-1 text-sm text-muted">
              총 {String(datasets.data.totalItems)}개 · 현재 페이지{' '}
              {String(datasets.data.items.length)}개
            </p>
          </div>
          <Badge>{tag === '' ? '전체 태그' : tag}</Badge>
        </div>

        <DataView
          footer={datasets.data.items.length === 0 ? undefined : (
            <Pagination
              isPending={datasets.isRefreshing}
              onPageChange={(value) => update('page', String(value))}
              page={datasets.data.page}
              pageSize={datasets.data.pageSize}
              totalItems={datasets.data.totalItems}
            />
          )}
          message="조건에 맞는 초안 데이터셋이 없습니다."
          state={datasets.data.items.length === 0 && !datasets.isRefreshing ? 'empty' : 'ready'}
        >
          {datasets.isRefreshing ? <QueryFeedback kind="loading" /> : null}
          {datasets.data.items.length === 0 ? null : (
            <Table aria-label="데이터셋 목록">
              <TableHeader>
                <TableRow>
                  <TableHead>데이터셋</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>태그</TableHead>
                  <TableHead>에피소드</TableHead>
                  <TableHead>수정 시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.data.items.map((dataset) => (
                  <TableRow key={dataset.id}>
                    <TableCell>
                      <Link
                        className="font-semibold underline"
                        to={appendPathSegment('/mlops/datasets', dataset.id)}
                      >
                        {dataset.name}
                      </Link>
                      <span className="mt-1 block max-w-xl truncate text-xs text-muted">
                        {dataset.description}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {dataset.id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge>{getDatasetStatusLabel(dataset.status)}</Badge>
                    </TableCell>
                    <TableCell>{dataset.tags.join(', ') || '—'}</TableCell>
                    <TableCell>{String(dataset.episodeIds.length)}개</TableCell>
                    <TableCell>{formatDateTime(dataset.updatedAtMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataView>
      </section>
    </div>
  );
}
