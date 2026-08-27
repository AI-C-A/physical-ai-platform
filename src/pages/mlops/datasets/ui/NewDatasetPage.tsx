import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useCreateDatasetCommand } from '@/entities/dataset';
import { appendPathSegment } from '@/shared/lib/navigation';
import { Breadcrumb } from '@/shared/ui/breadcrumb';
import { PageHeader } from '@/shared/ui/page-header';
import { useToast } from '@/shared/ui/toast';

import { DatasetEditor, type DatasetEditorValue } from './DatasetEditor';

export function NewDatasetPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialEpisodeId = params.get('episodeId');
  const {
    execute,
    reset,
    snapshot,
  } = useCreateDatasetCommand(initialEpisodeId);
  const { showToast } = useToast();
  const editorRegionRef = useRef<HTMLElement>(null);
  const handledOperationRef = useRef<number | null>(null);

  useEffect(() => {
    if (snapshot.status !== 'success') return;
    const dataset = snapshot.result;
    if (handledOperationRef.current === snapshot.operationId) return;
    handledOperationRef.current = snapshot.operationId;
    reset();
    showToast('초안 데이터셋을 생성했습니다.');
    void navigate(appendPathSegment('/mlops/datasets', dataset.id));
  }, [navigate, reset, showToast, snapshot]);

  async function save(value: DatasetEditorValue): Promise<void> {
    editorRegionRef.current?.focus();
    await execute(value);
  }
  const submittedValue = snapshot.status === 'pending' || snapshot.status === 'error'
    ? snapshot.submittedInput
    : snapshot.status === 'success'
      ? {
          name: snapshot.result.name,
          description: snapshot.result.description,
          tags: snapshot.result.tags,
          episodeIds: snapshot.result.episodeIds,
        }
      : undefined;
  const saveError = snapshot.status === 'error'
    ? snapshot.message
    : null;
  const isSavePending = snapshot.status === 'pending'
    || snapshot.status === 'success';
  const editorKey = snapshot.status === 'idle'
    ? initialEpisodeId ?? 'none'
    : `command-${String(snapshot.operationId)}`;
  return (
    <div className="grid gap-6">
      <Breadcrumb
        items={[
          { label: 'MLOps' },
          { label: '데이터셋', to: '/mlops/datasets' },
          { label: '새 데이터셋' },
        ]}
      />
      <PageHeader
        eyebrow="데이터셋 생성"
        title="새 데이터셋"
      />
      <section
        aria-label="데이터셋 편집 영역"
        className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        ref={editorRegionRef}
        tabIndex={-1}
      >
        <DatasetEditor
          initialEpisodeId={initialEpisodeId}
          initialValue={submittedValue}
          isSavePending={isSavePending}
          key={editorKey}
          onSave={save}
          saveError={saveError}
        />
      </section>
    </div>
  );
}
