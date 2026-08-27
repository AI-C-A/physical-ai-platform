import { useEffect, useMemo, useRef, useState } from 'react';

import type { Dataset } from '@/entities/dataset';
import {
  useEpisode,
  useEpisodeQuery,
  type Episode,
  type EpisodeQuery,
} from '@/entities/episode';
import { getExecutionProvenanceLabel } from '@/shared/domain';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Input } from '@/shared/ui/input';
import { Pagination } from '@/shared/ui/pagination';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Textarea } from '@/shared/ui/textarea';

const episodePageSize = 20;
const nameRequiredMessage = '데이터셋 이름을 입력해야 합니다.';

export interface DatasetEditorValue {
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly episodeIds: readonly string[];
}

interface DatasetEditorProps {
  readonly dataset?: Dataset;
  /** 재마운트된 command가 보존한 제출값을 서버 조회값과 분리해 다시 편집할 때 사용한다. */
  readonly initialValue?: DatasetEditorValue | undefined;
  readonly initialEpisodeId?: string | null;
  readonly isSavePending?: boolean;
  readonly onSave: (value: DatasetEditorValue) => Promise<void>;
  readonly saveError?: string | null;
}

interface DatasetEditorFormProps {
  readonly dataset: Dataset | undefined;
  readonly initialValue: DatasetEditorValue | undefined;
  readonly initialEpisode: Episode | null;
  readonly initialEpisodeMissing: boolean;
  readonly isSavePending: boolean;
  readonly onSave: (value: DatasetEditorValue) => Promise<void>;
  readonly saveError: string | null;
}

export function DatasetEditor({
  dataset,
  initialValue,
  initialEpisodeId = null,
  isSavePending = false,
  onSave,
  saveError = null,
}: DatasetEditorProps) {
  if (
    dataset === undefined
    && initialValue === undefined
    && initialEpisodeId !== null
  ) {
    return (
      <ValidatedInitialEpisodeEditor
        initialEpisodeId={initialEpisodeId}
        isSavePending={isSavePending}
        onSave={onSave}
        saveError={saveError}
      />
    );
  }
  return (
    <DatasetEditorForm
      dataset={dataset}
      initialValue={initialValue}
      initialEpisode={null}
      initialEpisodeMissing={false}
      isSavePending={isSavePending}
      onSave={onSave}
      saveError={saveError}
    />
  );
}

function ValidatedInitialEpisodeEditor({
  initialEpisodeId,
  isSavePending,
  onSave,
  saveError,
}: {
  readonly initialEpisodeId: string;
  readonly isSavePending: boolean;
  readonly onSave: DatasetEditorProps['onSave'];
  readonly saveError: string | null;
}) {
  const initialEpisode = useEpisode(initialEpisodeId);
  if (initialEpisode.status === 'loading') {
    return (
      <QueryFeedback kind="loading" />
    );
  }
  if (initialEpisode.status === 'error') {
    return (
      <QueryFeedback
        kind="error"
        message={initialEpisode.message}
        onRetry={initialEpisode.retry}
      />
    );
  }
  return (
    <div className="grid gap-6">
      {initialEpisode.refreshError === null ? null : (
        <Panel title="자동 선택 에피소드 정보를 갱신하지 못했습니다">
          <ErrorMessage>
            기존 선택은 유지했습니다. {initialEpisode.refreshError}
          </ErrorMessage>
          <Button className="mt-4" onClick={initialEpisode.retry} variant="secondary">
            다시 확인하기
          </Button>
        </Panel>
      )}
      <DatasetEditorForm
        dataset={undefined}
        initialValue={undefined}
        initialEpisode={initialEpisode.data}
        initialEpisodeMissing={initialEpisode.data === null}
        isSavePending={isSavePending}
        onSave={onSave}
        saveError={saveError}
      />
    </div>
  );
}

function DatasetEditorForm({
  dataset,
  initialValue,
  initialEpisode,
  initialEpisodeMissing,
  isSavePending,
  onSave,
  saveError,
}: DatasetEditorFormProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useMemo<EpisodeQuery>(() => ({
    search,
    robotId: null,
    environment: null,
    deliveryMode: null,
    sort: 'newest',
    page,
    pageSize: episodePageSize,
  }), [page, search]);
  const episodes = useEpisodeQuery(query);
  const [name, setName] = useState(initialValue?.name ?? dataset?.name ?? '');
  const [description, setDescription] = useState(
    initialValue?.description
      ?? dataset?.description
      ?? '선택한 에피소드로 구성한 초안 데이터셋입니다.',
  );
  const [tags, setTags] = useState(
    initialValue?.tags.join(', ') ?? dataset?.tags.join(', ') ?? '',
  );
  const [episodeIds, setEpisodeIds] = useState<readonly string[]>(
    initialValue?.episodeIds
      ?? dataset?.episodeIds
      ?? (initialEpisode === null ? [] : [initialEpisode.id]),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const hasUserEditsRef = useRef(false);
  const pendingRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const episodeSearchRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const displayedError = error ?? saveError;
  const hasNameValidationError = error === nameRequiredMessage;
  const effectivePending = isPending || isSavePending;

  useEffect(() => {
    if (displayedError !== null && !hasNameValidationError) {
      errorRef.current?.focus();
    }
  }, [displayedError, hasNameValidationError]);

  useEffect(() => {
    if (hasUserEditsRef.current) return;
    setName(initialValue?.name ?? dataset?.name ?? '');
    setDescription(
      initialValue?.description
        ?? dataset?.description
        ?? '선택한 에피소드로 구성한 초안 데이터셋입니다.',
    );
    setTags(initialValue?.tags.join(', ') ?? dataset?.tags.join(', ') ?? '');
    setEpisodeIds(
      initialValue?.episodeIds
        ?? dataset?.episodeIds
        ?? (initialEpisode === null ? [] : [initialEpisode.id]),
    );
  }, [dataset, initialEpisode, initialValue]);

  if (episodes.status === 'loading') {
    return (
      <QueryFeedback kind="loading" />
    );
  }
  if (episodes.status === 'error') {
    return (
      <QueryFeedback
        kind="error"
        message={episodes.message}
        onRetry={episodes.retry}
      />
    );
  }

  const visibleEpisodeIds = new Set(episodes.data.items.map((episode) => episode.id));
  const selectedOutsidePageIds = episodeIds.filter(
    (episodeId) => !visibleEpisodeIds.has(episodeId),
  );

  function toggle(id: string, checked: boolean): void {
    hasUserEditsRef.current = true;
    setEpisodeIds((current) => checked
      ? [...new Set([...current, id])]
      : current.filter((item) => item !== id));
  }

  function updateSearch(value: string): void {
    setSearch(value);
    setPage(1);
  }

  function getSelectedEpisodeLabel(episodeId: string): string {
    if (initialEpisode?.id === episodeId) {
      return `${initialEpisode.name} · ${episodeId}`;
    }
    return `에피소드 ID: ${episodeId}`;
  }

  function save(): void {
    if (pendingRef.current || isSavePending) return;
    if (name.trim().length === 0) {
      setError(nameRequiredMessage);
      nameInputRef.current?.focus();
      return;
    }
    if (episodeIds.length === 0) {
      setError('에피소드를 하나 이상 선택해야 합니다.');
      return;
    }
    setError(null);
    pendingRef.current = true;
    setIsPending(true);
    void onSave({
      name: name.trim(),
      description: description.trim(),
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      episodeIds,
    })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '데이터셋 저장에 실패했습니다.');
      })
      .finally(() => {
        pendingRef.current = false;
        setIsPending(false);
      });
  }

  return (
    <fieldset
      className="grid min-w-0 gap-6 border-0 p-0"
      disabled={effectivePending}
    >
      <legend className="sr-only">데이터셋 편집</legend>
      <p aria-live="polite" className="sr-only" role="status">
        {effectivePending ? '데이터셋을 저장하는 중입니다.' : ''}
      </p>
      {initialEpisodeMissing ? (
        <QueryFeedback
          kind="empty"
          message="요청한 에피소드를 찾지 못해 자동 선택하지 않았습니다. 목록에서 사용할 에피소드를 선택하세요."
        />
      ) : null}
      {selectedOutsidePageIds.length === 0 ? null : (
        <Panel title="현재 목록 밖의 선택">
          <p role="status">
            현재 검색 또는 페이지에 표시되지 않은 선택 {String(selectedOutsidePageIds.length)}개를
            저장 시 그대로 유지합니다.
          </p>
          <ul className="mt-2 grid gap-2 text-sm text-neutral-700">
            {selectedOutsidePageIds.map((episodeId) => (
              <li className="flex flex-wrap items-center justify-between gap-2" key={episodeId}>
                <span className="break-all">{getSelectedEpisodeLabel(episodeId)}</span>
                <Button
                  aria-label={`${getSelectedEpisodeLabel(episodeId)} 선택 해제`}
                  onClick={() => {
                    episodeSearchRef.current?.focus();
                    toggle(episodeId, false);
                  }}
                  variant="ghost"
                >
                  선택 해제
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <Panel
          title="데이터셋 정보"
        >
          <div className="grid gap-4">
            <Input
              {...(hasNameValidationError ? { error: nameRequiredMessage } : {})}
              inputRef={nameInputRef}
              label="데이터셋 이름"
              onChange={(event) => {
                hasUserEditsRef.current = true;
                setName(event.target.value);
                if (hasNameValidationError) setError(null);
              }}
              value={name}
            />
            <Textarea
              label="설명"
              onChange={(event) => {
                hasUserEditsRef.current = true;
                setDescription(event.target.value);
              }}
              value={description}
            />
            <Input
              label="태그"
              onChange={(event) => {
                hasUserEditsRef.current = true;
                setTags(event.target.value);
              }}
              placeholder="쉼표로 구분"
              value={tags}
            />
          </div>
        </Panel>
        <Panel
          description={`검색 결과 ${String(episodes.data.totalItems)}개 · 선택 ${String(episodeIds.length)}개`}
          title="에피소드 구성"
        >
          <div className="grid gap-4">
            <Input
              inputRef={episodeSearchRef}
              label="구성할 에피소드 검색"
              onChange={(event) => updateSearch(event.target.value)}
              value={search}
            />
            {episodes.refreshError === null ? null : (
              <div className="grid justify-items-start gap-2">
                <ErrorMessage>
                  기존 에피소드 결과를 유지했습니다. {episodes.refreshError}
                </ErrorMessage>
                <Button onClick={episodes.retry} variant="secondary">
                  에피소드 다시 불러오기
                </Button>
              </div>
            )}
            {episodes.isRefreshing ? (
              <QueryFeedback kind="loading" />
            ) : null}
            {episodes.data.items.length === 0 ? (
              episodes.isRefreshing ? null : (
                <QueryFeedback kind="empty" message="조건에 맞는 완료 에피소드가 없습니다." />
              )
            ) : (
              <div className="grid max-h-[28rem] gap-2 overflow-auto pr-1">
                {episodes.data.items.map((episode) => (
                  <Checkbox
                    checked={episodeIds.includes(episode.id)}
                    key={episode.id}
                    label={`${episode.name} · ${episode.robotId} · ${getExecutionProvenanceLabel(episode.provenance)}`}
                    onCheckedChange={(checked) => toggle(episode.id, checked)}
                  />
                ))}
              </div>
            )}
            {episodes.data.totalItems === 0 ? null : (
              <Pagination
                isPending={episodes.isRefreshing}
                onPageChange={setPage}
                page={episodes.data.page}
                pageSize={episodes.data.pageSize}
                totalItems={episodes.data.totalItems}
              />
            )}
          </div>
        </Panel>
      </div>
      {displayedError === null || hasNameValidationError ? null : (
        <ErrorMessage ref={errorRef} tabIndex={-1}>
          {displayedError}
        </ErrorMessage>
      )}
      <div className="flex justify-end">
        <Button isLoading={effectivePending} onClick={save}>
          초안 저장
        </Button>
      </div>
    </fieldset>
  );
}
