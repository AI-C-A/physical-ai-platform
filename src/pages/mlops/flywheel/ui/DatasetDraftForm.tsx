import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useFlywheelPort, useFlywheelQuery, type DataUnitKind, type DatasetUnitRef, type FlywheelPort, type QualityStatus } from '@/entities/flywheel';
import { formatBytes } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { Panel } from '@/shared/ui/panel';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

import { DefinitionGrid, StatusBadge } from './flywheel-page-shared';

interface DatasetSource {
  readonly id: string;
  readonly label: string;
  readonly projectId: string;
  readonly quality: QualityStatus;
  readonly bytes: number | null;
  readonly ref: DatasetUnitRef;
}

const kindOptions = [
  { label: '휴머노이드 에피소드', value: 'humanoid-episode' },
  { label: '주행 구간', value: 'drive-window' },
  { label: '개입 구간', value: 'intervention-window' },
] as const;

async function loadSources(port: FlywheelPort, kind: DataUnitKind): Promise<readonly DatasetSource[]> {
  if (kind === 'humanoid-episode') {
    const [episodes, sessions] = await Promise.all([port.listEpisodes(), port.listSessions()]);
    return episodes
      .filter((item) => item.status === 'completed' && item.endedAtMs !== null
        && !sessions.some((session) => session.kind === 'humanoid' && session.activeEpisodeId === item.id))
      .map((item) => ({
        id: item.id, label: item.name, projectId: item.projectId, quality: item.qualityStatus,
        bytes: item.bytesWritten, ref: { kind: 'episode', episodeId: item.id },
      }));
  }
  if (kind === 'drive-window') {
    return (await port.listDriveSessions())
      .filter((item) => item.status === 'completed' && item.durationMs > 0)
      .map((item) => ({
        id: item.id, label: `${item.routeId} · ${String(Math.round(item.durationMs / 1_000))}초`,
        projectId: item.projectId, quality: item.qualityStatus,
        bytes: item.chunks.reduce((total, chunk) => total + chunk.bytesWritten, 0),
        ref: { kind: 'drive-window', driveSessionId: item.id, startMs: 0, endMs: item.durationMs },
      }));
  }
  const [interventions, drives] = await Promise.all([port.listInterventions(), port.listDriveSessions()]);
  return interventions
    .filter((item) => item.endMs !== null && drives.some((drive) => drive.id === item.driveSessionId && drive.status === 'completed'))
    .map((item) => ({
      id: item.id, label: item.note || item.id, projectId: item.projectId, quality: item.qualityStatus,
      bytes: null, ref: { kind: 'intervention-window', interventionId: item.id, preMs: 10_000, postMs: 20_000 },
    }));
}

export function DatasetDraftForm() {
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialKind = kindOptions.find((option) => option.value === params.get('kind'))?.value ?? 'humanoid-episode';
  const [kind, setKind] = useState<DataUnitKind>(initialKind);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(() => [...new Set(params.getAll(
    initialKind === 'humanoid-episode' ? 'episode' : initialKind === 'drive-window' ? 'drive' : 'intervention',
  ))]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback((value: FlywheelPort) => loadSources(value, kind), [kind]);
  const query = useFlywheelQuery(load);
  const sources = query.status === 'ready' ? query.data : [];
  const selected = sources.filter((source) => selectedIds.includes(source.id));
  const unavailableCount = query.status === 'ready'
    ? selectedIds.filter((id) => !sources.some((source) => source.id === id)).length
    : 0;
  const totalBytes = selected.some((source) => source.bytes === null)
    ? null
    : selected.reduce((total, source) => total + (source.bytes ?? 0), 0);
  const canCreate = query.status === 'ready' && selected.length > 0 && unavailableCount === 0 && name.trim().length > 0;

  async function create(): Promise<void> {
    const firstSource = selected[0];
    if (pending || !canCreate || firstSource === undefined) return;
    if (selected.some((source) => source.projectId !== firstSource.projectId)) {
      setMessage('같은 프로젝트의 데이터만 선택하세요.');
      return;
    }
    setMessage(null);
    setPending(true);
    try {
      const created = await port.createDataset({
        projectId: firstSource.projectId, name: name.trim(), description: description.trim(), kind,
        tags: [kind], unitRefs: selected.map((source) => source.ref),
      });
      await navigate(`/mlops/datasets/${created.id}`);
    } catch {
      setMessage('데이터셋을 생성하지 못했습니다. 선택한 데이터의 저장 상태를 확인한 뒤 다시 시도하세요.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="데이터셋 만들기" description="저장이 완료된 데이터를 직접 선택해 새 학습 데이터셋을 구성하세요." />
      <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <fieldset className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]" disabled={pending}>
          <div className="grid min-w-0 gap-6">
            <Panel title="기본 정보">
              <div className="grid gap-4">
                <Select label="데이터셋 유형" value={kind} options={kindOptions} onValueChange={(value) => {
                  setKind(value as DataUnitKind);
                  setSelectedIds([]);
                  setMessage(null);
                }} />
                <Input label="이름" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="데이터를 구분할 이름" required />
                <Textarea label="설명" value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
            </Panel>
            <Panel title="데이터 선택" description={kind === 'intervention-window' ? '개입 전 10초와 후 20초 구간을 포함합니다.' : kind === 'drive-window' ? '선택한 주행의 전체 저장 구간을 포함합니다.' : '데이터셋에 포함할 에피소드를 선택하세요.'}>
              {query.status === 'loading' ? <p className="text-sm text-muted" role="status">저장된 데이터를 불러오는 중입니다.</p> : query.status === 'error' ? (
                <div className="grid justify-items-start gap-3">
                  <p className="text-sm text-negative" role="alert">저장된 데이터를 불러오지 못했습니다.</p>
                  <Button onClick={query.retry} variant="secondary">데이터 다시 불러오기</Button>
                </div>
              ) : sources.length === 0 ? <p className="text-sm text-muted" role="status">저장이 완료된 데이터가 없습니다. 수집을 마친 뒤 다시 확인하세요.</p> : (
                <div className="divide-y divide-border">
                  {sources.map((source) => (
                    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={source.id}>
                      <Checkbox checked={selectedIds.includes(source.id)} label={source.label} onCheckedChange={(checked) => setSelectedIds((current) => checked ? [...current, source.id] : current.filter((id) => id !== source.id))} />
                      <StatusBadge status={source.quality} />
                    </div>
                  ))}
                </div>
              )}
              {unavailableCount > 0 ? (
                <div className="mt-4 grid justify-items-start gap-2">
                  <p className="text-sm text-negative" role="alert">요청한 데이터 {String(unavailableCount)}개를 찾을 수 없거나 저장이 끝나지 않았습니다.</p>
                  <Button onClick={() => setSelectedIds(selected.map((source) => source.id))} variant="secondary">사용할 수 없는 항목 제외</Button>
                </div>
              ) : null}
            </Panel>
          </div>
          <Panel className="self-start" title="선택 요약">
            <DefinitionGrid items={[
              { label: '선택한 데이터', value: `${String(selected.length)}개` },
              { label: '품질 검사 통과', value: `${String(selected.filter((source) => source.quality === 'passed').length)}개` },
              { label: '저장 용량', value: totalBytes === null ? '확인할 수 없음' : formatBytes(totalBytes) },
              { label: '학습 / 검증 / 테스트', value: '80% / 10% / 10%' },
            ]} />
            <p className="mt-4 text-sm leading-6 text-muted">초안 생성 후 품질과 검수 결과를 확인하고 릴리스하세요.</p>
            {message === null ? null : <p className="mt-4 text-sm text-negative" role="alert">{message}</p>}
            <Button className="mt-5 w-full" disabled={!canCreate} isLoading={pending} type="submit">초안 생성</Button>
          </Panel>
        </fieldset>
      </form>
    </div>
  );
}
