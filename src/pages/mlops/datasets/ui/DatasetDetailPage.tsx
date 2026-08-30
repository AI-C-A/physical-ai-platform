import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  getDatasetStatusLabel,
  useDataset,
  useUpdateDatasetCommand,
  type Dataset,
} from '@/entities/dataset';
import { formatDateTime } from '@/shared/lib/format';
import { decodePathSegment } from '@/shared/lib/navigation';
import { Badge } from '@/shared/ui/badge';
import { Breadcrumb } from '@/shared/ui/breadcrumb';
import { Button } from '@/shared/ui/button';
import { DetailPane } from '@/shared/ui/detail-pane';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Icon } from '@/shared/ui/icon';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { StatTile } from '@/shared/ui/stat-tile';
import { useToast } from '@/shared/ui/toast';

import { DatasetEditor, type DatasetEditorValue } from './DatasetEditor';

function isSameDataset(left: Dataset | null, right: Dataset): boolean {
  return left !== null
    && left.id === right.id
    && left.name === right.name
    && left.description === right.description
    && left.status === right.status
    && left.createdAtMs === right.createdAtMs
    && left.updatedAtMs === right.updatedAtMs
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
    && left.episodeIds.length === right.episodeIds.length
    && left.episodeIds.every((episodeId, index) => episodeId === right.episodeIds[index]);
}

function DatasetDetailContent({ datasetId }: { readonly datasetId: string }) {
  const result = useDataset(datasetId);
  const {
    clearLastSuccess,
    execute,
    reset,
    snapshot,
  } = useUpdateDatasetCommand(datasetId);
  const { showToast } = useToast();
  const editorRegionRef = useRef<HTMLElement>(null);
  const handledOperationRef = useRef<number | null>(null);
  const [handledOperationId, setHandledOperationId] = useState<number | null>(null);
  const isSavePending = snapshot.status === 'pending'
    || snapshot.status === 'success';
  const submission = snapshot.status === 'pending' || snapshot.status === 'error'
    ? { operationId: snapshot.operationId, value: snapshot.submittedInput }
    : null;
  const retainedDataset = snapshot.status === 'success'
    ? snapshot.result
    : snapshot.status === 'idle'
      ? snapshot.lastSuccess?.result ?? null
      : null;

  useEffect(() => {
    if (snapshot.status !== 'success') return;
    if (handledOperationRef.current === snapshot.operationId) return;
    handledOperationRef.current = snapshot.operationId;
    setHandledOperationId(snapshot.operationId);
    reset({ retainSuccess: true });
    editorRegionRef.current?.focus();
    showToast('초안 데이터셋을 저장했습니다.');
  }, [reset, showToast, snapshot]);

  useEffect(() => {
    if (
      snapshot.status === 'idle'
      && snapshot.lastSuccess !== null
      && result.status === 'ready'
      && (isSameDataset(result.data, snapshot.lastSuccess.result)
        || (result.data !== null
          && result.data.updatedAtMs > snapshot.lastSuccess.result.updatedAtMs))
    ) {
      clearLastSuccess();
    }
  }, [clearLastSuccess, result, snapshot]);

  async function save(value: DatasetEditorValue): Promise<void> {
    editorRegionRef.current?.focus();
    await execute(value);
  }

  const queryDataset = result.status === 'ready' ? result.data : null;
  const displayDataset = retainedDataset ?? queryDataset;
  const saveError = snapshot.status === 'error'
    ? snapshot.message
    : null;

  if (displayDataset === null && submission !== null) {
    const commandRevision = `submission-${String(submission.operationId)}`;
    return (
      <div className="grid gap-6">
        <Breadcrumb
          items={[
            { label: 'MLOps' },
            { label: '데이터셋', to: '/mlops/datasets' },
            { label: submission.value.name },
          ]}
        />
        <PageHeader
          eyebrow="데이터셋 상세"
          title={submission.value.name}
        />
        {result.status === 'loading' ? (
          <QueryFeedback kind="loading" />
        ) : result.status === 'error' ? (
          <DetailPane title="데이터셋 원본을 불러오지 못했습니다">
            <ErrorMessage>저장 시도 입력은 유지했습니다. {result.message}</ErrorMessage>
            <Button className="mt-4" onClick={result.retry} variant="secondary">
              다시 불러오기
            </Button>
          </DetailPane>
        ) : (
          <QueryFeedback
            kind="not-found"
            message="원본 데이터셋을 찾지 못했지만 마지막 저장 시도 입력은 아래에 유지했습니다."
          />
        )}
        <section
          aria-label="데이터셋 편집 영역"
          className="rounded-[var(--design-radius-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          ref={editorRegionRef}
          tabIndex={-1}
        >
          <DatasetEditor
            initialValue={submission.value}
            isSavePending={isSavePending}
            key={commandRevision}
            onSave={save}
            saveError={saveError}
          />
        </section>
      </div>
    );
  }

  if (displayDataset === null && result.status === 'loading') {
    return (
      <QueryFeedback kind="loading" />
    );
  }
  if (displayDataset === null && result.status === 'error') {
    return <QueryFeedback kind="error" message={result.message} onRetry={result.retry} />;
  }
  if (displayDataset === null) return <div className="grid gap-6"><Breadcrumb items={[{ label: 'MLOps' }, { label: '데이터셋', to: '/mlops/datasets' }, { label: '데이터셋 없음' }]} /><QueryFeedback kind="not-found" message="요청한 데이터셋을 찾을 수 없습니다." /><Link className="inline-flex items-center gap-1 text-sm font-semibold underline" to="/mlops/datasets"><Icon name="back" />데이터셋으로</Link></div>;
  const lastSuccess = snapshot.status === 'idle' ? snapshot.lastSuccess : null;
  const editorRevision = snapshot.status === 'success'
    ? `command-${String(snapshot.operationId)}`
    : snapshot.status === 'pending' || snapshot.status === 'error'
      ? `submission-${String(snapshot.operationId)}`
    : lastSuccess !== null
      ? `saved-${String(lastSuccess.operationId)}`
      : handledOperationId === null
        ? 'query'
        : `saved-${String(handledOperationId)}`;
  return (
    <div className="grid gap-6">
      <Breadcrumb
        items={[
          { label: 'MLOps' },
          { label: '데이터셋', to: '/mlops/datasets' },
          { label: displayDataset.name },
        ]}
      />
      <PageHeader
        actions={<Badge>{getDatasetStatusLabel(displayDataset.status)}</Badge>}
        description={displayDataset.description}
        eyebrow="데이터셋 상세"
        title={displayDataset.name}
      />
      <Link className="inline-flex items-center gap-1 text-sm font-semibold underline" to="/mlops/datasets">
        <Icon name="back" />데이터셋으로
      </Link>
      {result.status === 'loading' && retainedDataset !== null ? (
        <QueryFeedback kind="loading" />
      ) : result.status === 'error' ? (
        <DetailPane title="최신 데이터셋 정보를 불러오지 못했습니다">
          <ErrorMessage>방금 저장한 결과는 유지했습니다. {result.message}</ErrorMessage>
          <Button className="mt-4" onClick={result.retry} variant="secondary">
            다시 불러오기
          </Button>
        </DetailPane>
      ) : result.status === 'ready' && result.data === null && retainedDataset !== null ? (
        <DetailPane title="저장 결과를 상세 조회에서 확인하지 못했습니다">
          <ErrorMessage>방금 저장한 결과를 유지했습니다. 원본을 다시 확인해 주세요.</ErrorMessage>
          <Button className="mt-4" onClick={result.retry} variant="secondary">
            다시 불러오기
          </Button>
        </DetailPane>
      ) : result.refreshError === null ? null : (
        <DetailPane title="최신 데이터셋 정보를 반영하지 못했습니다">
          <ErrorMessage>입력 중인 내용은 유지했습니다. {result.refreshError}</ErrorMessage>
          <Button className="mt-4" onClick={result.retry} variant="secondary">
            다시 불러오기
          </Button>
        </DetailPane>
      )}
      <section
        aria-label="데이터셋 요약"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatTile
          emphasis="primary"
          label="상태"
          value={getDatasetStatusLabel(displayDataset.status)}
        />
        <StatTile label="에피소드" value={`${String(displayDataset.episodeIds.length)}개`} />
        <StatTile label="태그" value={displayDataset.tags.join(', ') || '—'} />
        <StatTile label="최근 수정" value={formatDateTime(displayDataset.updatedAtMs)} />
      </section>
      <section
        aria-label="데이터셋 편집 영역"
        className="rounded-[var(--design-radius-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        ref={editorRegionRef}
        tabIndex={-1}
      >
        <DatasetEditor
          dataset={displayDataset}
          initialValue={submission?.value}
          isSavePending={isSavePending}
          key={`${displayDataset.id}:${editorRevision}`}
          onSave={save}
          saveError={saveError}
        />
      </section>
    </div>
  );
}

export function DatasetDetailPage() {
  const { datasetId: encodedDatasetId = '' } = useParams();
  const datasetId = decodePathSegment(encodedDatasetId);
  return <DatasetDetailContent datasetId={datasetId} key={datasetId} />;
}
