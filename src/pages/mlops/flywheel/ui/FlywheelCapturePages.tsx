import { useCallback, useRef, useState } from "react";
import {
  useParams,
} from "react-router-dom";

import {
  useFlywheelPort,
  useFlywheelQuery,
  type InterventionEvent,
} from "@/entities/flywheel";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { PageHeader } from "@/shared/ui/page-header";
import { Panel } from "@/shared/ui/panel";
import { Select } from "@/shared/ui/select";
import { StatTile } from "@/shared/ui/stat-tile";
import { Timeline } from "@/shared/ui/timeline";
import { formatBytes } from '@/shared/lib/format';
import { downloadTextFile } from '@/shared/lib/record-export';
import { getExecutionEnvironmentLabel } from '@/shared/domain';

import {
  ActionLink,
  AsyncState,
  DefinitionGrid,
  DetailLink,
  StatusBadge,
} from "./flywheel-page-shared";
import {
  formatDuration,
  formatDateTime,
} from "./flywheel-page-utils";
import { getEpisodeStorageLabel, getEpisodeTimelineMarkers } from './episode-presentation';
import { getStatusLabel } from './flywheel-status';
import { createEpisodeExportRecord } from './flywheel-export-records';
import { getDriveTimelineMarkers, getInterventionTimelineMarkers } from './drive-record-presentation';

export function FlywheelEpisodeDetailPage() {
  const { episodeId = "" } = useParams();
  const [exportStatus, setExportStatus] = useState('');
  const [exportError, setExportError] = useState(false);
  const load = useCallback(
    (port: ReturnType<typeof useFlywheelPort>) => port.getEpisode(episodeId),
    [episodeId],
  );
  const query = useFlywheelQuery(load);
  return (
    <div className="grid gap-6">
      <AsyncState query={query} emptyMessage="에피소드를 찾을 수 없습니다.">
        {(episode) => (
          <>
            <PageHeader
              title={episode.name}
              description={`${episode.taskId} · ${getExecutionEnvironmentLabel(episode.provenance.environment)}`}
              actions={
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={getEpisodeStorageLabel(episode)} />
                  <Button variant="secondary" onClick={() => {
                    try {
                      downloadTextFile(`episode-${episode.id.replace(/[^a-z0-9_-]/giu, '-')}.json`, JSON.stringify(createEpisodeExportRecord(episode), null, 2), 'application/json');
                      setExportStatus('에피소드의 상태·수집 소스·이벤트 정보를 내보냈습니다.');
                      setExportError(false);
                    } catch {
                      setExportStatus('기록 정보를 내보내지 못했습니다. 다시 시도하세요.');
                      setExportError(true);
                    }
                  }}>기록 정보 내보내기</Button>
                </div>
              }
            />
            {exportStatus ? <p className={`text-sm ${exportError ? 'text-negative' : 'text-muted'}`} role={exportError ? 'alert' : 'status'}>{exportStatus}</p> : null}
            <Panel title="동기 멀티뷰">
              <p className="text-sm text-muted">이 에피소드의 재생 영상이 연결되지 않았습니다. 아래에서 기록 정보를 확인하세요.</p>
            </Panel>
            <Panel title="영상 / 상태 / 동작 타임라인">
              <Timeline
                durationLabel={
                  episode.endedAtMs === null
                    ? "기록 중"
                    : formatDuration(episode.endedAtMs - episode.startedAtMs)
                }
                markers={getEpisodeTimelineMarkers(episode)}
              />
              {episode.events.length === 0 ? <p className="mt-3 text-sm text-muted">기록된 이벤트가 없습니다.</p> : null}
            </Panel>
            <Panel title="에피소드 정보">
              <DefinitionGrid
                items={[
                  { label: "작업 지시", value: episode.instruction },
                  { label: "저장 상태", value: getEpisodeStorageLabel(episode) },
                  { label: "작업 결과", value: episode.outcome === 'success' ? '성공' : episode.outcome === 'failure' ? '실패' : episode.outcome === 'aborted' ? '중단' : '미확정' },
                  { label: "검수 상태", value: getStatusLabel(episode.annotationStatus) },
                  { label: "품질 검사", value: getStatusLabel(episode.qualityStatus) },
                  {
                    label: episode.humanDemonstration === null ? '로봇·센서' : '참여자·외골격 장치',
                    value: episode.humanDemonstration === null
                      ? `${episode.robotId ?? '미지정'} · ${episode.sensorDeviceId ?? '미지정'}`
                      : `${episode.humanDemonstration.participantId} · ${episode.humanDemonstration.exoskeletonDeviceId}`,
                  },
                  {
                    label: "수집 용량",
                    value: formatBytes(episode.bytesWritten),
                  },
                ]}
              />
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function DriveDetailPage() {
  const { driveSessionId = "" } = useParams();
  const load = useCallback(async (port: ReturnType<typeof useFlywheelPort>) => {
    const drive = await port.getDriveSession(driveSessionId);
    if (drive === null) return null;
    const [session, records] = await Promise.all([
      port.getSession(drive.captureSessionId).catch(() => null),
      Promise.all(drive.interventionIds.map((id) => port.getIntervention(id).catch(() => null))),
    ]);
    const interventions = records.filter((item): item is InterventionEvent => item !== null && item.driveSessionId === drive.id);
    return { drive, session, interventions, missingCount: records.length - interventions.length };
  }, [driveSessionId]);
  const query = useFlywheelQuery(load);
  const activeQuery = query.status === 'ready' && query.data !== null && query.data.drive.id !== driveSessionId
    ? { ...query, status: 'loading' as const } : query;
  return (
    <div className="grid gap-6">
      <AsyncState query={activeQuery} emptyMessage="주행 세션을 찾을 수 없습니다.">
        {({ drive, session, interventions, missingCount }) => (
          <>
            <PageHeader
              title={`주행 · ${drive.routeId}`}
              description={session === null ? '수집 환경 미확인' : getExecutionEnvironmentLabel(session.provenance.environment)}
              actions={<ActionLink to={`/mlops/datasets/new?kind=drive-window&drive=${encodeURIComponent(drive.id)}`}>주행 구간으로 데이터셋 만들기</ActionLink>}
            />
            <div className="grid gap-4 md:grid-cols-4">
              <StatTile label="주행 시간" value={formatDuration(drive.durationMs)} />
              <StatTile label="거리" value={`${(drive.distanceMeters / 1000).toFixed(2)} km`} />
              <StatTile label="자율 비율" value={`${(drive.autonomyRatio * 100).toFixed(1)}%`} />
              <StatTile label="기록 청크" value={String(drive.chunks.length)} />
            </div>
            <Panel title="주행 정보">
              <DefinitionGrid items={[
                { label: '경로', value: drive.routeId },
                { label: '사이트', value: drive.siteId },
                { label: '로봇', value: drive.robotId },
                { label: '기록 상태', value: getStatusLabel(drive.status) },
                { label: '시작 시각', value: formatDateTime(drive.startedAtMs) },
                { label: '종료 시각', value: drive.endedAtMs === null ? '미확정' : formatDateTime(drive.endedAtMs) },
              ]} />
              <p className="mt-4 text-sm text-muted">경로 좌표가 연결되지 않아 지도 궤적을 표시할 수 없습니다.</p>
            </Panel>
            <Panel title="주행 영상">
              <p className="text-sm text-muted">이 주행의 녹화 영상이 연결되지 않았습니다.</p>
            </Panel>
            <Panel title="주행과 개입 기록">
              <Timeline
                title="기록된 시각 기준"
                durationLabel={drive.endedAtMs === null ? `${formatDuration(drive.durationMs)} 수신 · 주행 중` : formatDuration(drive.durationMs)}
                markers={getDriveTimelineMarkers(drive, interventions)}
              />
              {missingCount > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-warning" role="status">
                  <p>연결된 개입 {missingCount}건을 불러오지 못했습니다.</p>
                  <Button onClick={query.retry} variant="secondary">개입 기록 다시 확인</Button>
                </div>
              ) : null}
              {drive.interventionIds.length === 0 ? <p className="mt-4 text-sm text-muted">기록된 개입이 없습니다.</p> : (
                <ul className="mt-4 divide-y divide-border">
                  {[...interventions].sort((left, right) => left.startMs - right.startMs).map((item) => (
                    <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={item.id}>
                      <DetailLink to={`/mlops/interventions/${encodeURIComponent(item.id)}`}>{item.id}</DetailLink>
                      <span className="text-muted">주행 시작 후 {formatDuration(item.startMs - drive.startedAtMs)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

const interventionReasonOptions = [
  { label: '장애물', value: 'obstacle' },
  { label: '위치 추정', value: 'localization' },
  { label: '경로 계획', value: 'planning' },
  { label: '인지', value: 'perception' },
  { label: '안전', value: 'safety' },
  { label: '미확인', value: 'unknown' },
] as const;

function InterventionReview({ item, onSaved }: { readonly item: InterventionEvent; readonly onSaved: () => void }) {
  const port = useFlywheelPort();
  const [reason, setReason] = useState(item.reason);
  const [severity, setSeverity] = useState(item.severity);
  const [note, setNote] = useState(item.note);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [feedback, setFeedback] = useState<{ readonly error: boolean; readonly message: string } | null>(null);
  const hasCompletedBoundary = item.endMs !== null && item.endMs > item.startMs;

  async function save(): Promise<void> {
    if (pendingRef.current || !hasCompletedBoundary) return;
    pendingRef.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const saved = await port.updateIntervention(item.id, {
        startMs: item.startMs,
        endMs: item.endMs,
        reason,
        severity,
        outcome: item.outcome,
        note,
      });
      setReason(saved.reason);
      setSeverity(saved.severity);
      setNote(saved.note);
      setFeedback({ error: false, message: '검토 내용을 저장했습니다.' });
      onSaved();
    } catch {
      setFeedback({ error: true, message: '검토 내용을 저장하지 못했습니다. 입력한 내용을 확인하고 다시 시도해 주세요.' });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Panel title="개입 검토">
      <form aria-busy={pending} className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <Select
          disabled={pending}
          label="원인"
          onValueChange={(value) => { setReason(value as InterventionEvent['reason']); setFeedback(null); }}
          options={interventionReasonOptions}
          value={reason}
        />
        <Select
          disabled={pending}
          label="심각도"
          onValueChange={(value) => { setSeverity(value as InterventionEvent['severity']); setFeedback(null); }}
          options={[{ label: '낮음', value: 'low' }, { label: '보통', value: 'medium' }, { label: '높음', value: 'high' }]}
          value={severity}
        />
        <Input
          className="md:col-span-2"
          disabled={pending}
          label="검토 메모"
          onChange={(event) => { setNote(event.target.value); setFeedback(null); }}
          value={note}
        />
        {!hasCompletedBoundary ? <p className="text-sm text-muted md:col-span-2" role="status">종료 시각이 확정되면 검토 내용을 저장할 수 있습니다. 입력한 내용은 이 화면에서 유지됩니다.</p> : null}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={!hasCompletedBoundary || pending} isLoading={pending} type="submit">검토 저장</Button>
          {hasCompletedBoundary ? <ActionLink to={`/mlops/datasets/new?kind=intervention-window&intervention=${encodeURIComponent(item.id)}`}>개입 구간으로 데이터셋 만들기</ActionLink> : null}
        </div>
        {feedback === null ? null : <p className={`text-sm md:col-span-2 ${feedback.error ? 'text-negative' : 'text-muted'}`} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
      </form>
    </Panel>
  );
}

export function InterventionDetailPage() {
  const { interventionId = "" } = useParams();
  const load = useCallback(async (port: ReturnType<typeof useFlywheelPort>) => {
    const item = await port.getIntervention(interventionId);
    if (item === null) return null;
    const drive = await port.getDriveSession(item.driveSessionId).catch(() => null);
    const session = drive === null ? null : await port.getSession(drive.captureSessionId).catch(() => null);
    return { item, session };
  }, [interventionId]);
  const query = useFlywheelQuery(load);
  const activeQuery = query.status === 'ready' && query.data !== null && query.data.item.id !== interventionId
    ? { ...query, status: 'loading' as const } : query;
  const triggerLabels = { 'control-transition': '제어 전환', 'operator-request': '운영자 요청', 'safety-stop': '안전 정지' } as const;

  return (
    <div className="grid gap-6">
      <AsyncState query={activeQuery} emptyMessage="개입 이벤트를 찾을 수 없습니다.">
        {({ item, session }) => (
          <>
            <PageHeader
              title={`개입 기록 · ${item.id}`}
              description={`${triggerLabels[item.trigger]} · ${session === null ? '수집 환경 미확인' : getExecutionEnvironmentLabel(session.provenance.environment)}`}
              actions={<StatusBadge status={item.status} />}
            />
            <Panel title="개입 영상">
              <p className="text-sm text-muted">이 개입의 재생 영상이 연결되지 않았습니다. 아래에서 기록된 시각과 검토 내용을 확인하세요.</p>
            </Panel>
            <Panel title="기록된 제어 전환">
              <Timeline
                title="기록된 시각 기준"
                durationLabel={item.endMs === null ? '종료 시각 미확정' : formatDuration(item.endMs - item.startMs)}
                markers={getInterventionTimelineMarkers(item)}
              />
              <div className="mt-4">
                <DefinitionGrid items={[
                  { label: '기록 시작', value: formatDateTime(item.startMs) },
                  { label: '제어 복귀', value: item.controlReturnedAtMs === null ? '미수신' : formatDateTime(item.controlReturnedAtMs) },
                  { label: '기록 종료', value: item.endMs === null ? '미확정' : formatDateTime(item.endMs) },
                  { label: '주행 세션', value: <DetailLink to={`/mlops/drives/${encodeURIComponent(item.driveSessionId)}`}>{item.driveSessionId}</DetailLink> },
                ]} />
              </div>
            </Panel>
            <InterventionReview item={item} key={item.id} onSaved={query.retry} />
          </>
        )}
      </AsyncState>
    </div>
  );
}
