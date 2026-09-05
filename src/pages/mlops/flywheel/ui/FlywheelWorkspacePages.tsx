import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import {
  CollectionPerceptionViewer,
  HumanoidRigViewer,
  loadCollectionBodyPoseViewer,
  loadQuestHandPoseViewer,
  useCollectionTelemetry,
  useFlywheelPort,
  useFlywheelQuery,
  type CollectionStreamTelemetry,
  type CollectionHandPoseTelemetry,
  type CollectionTelemetryConnectionState,
  type CollectionTelemetrySnapshot,
  type FlywheelEpisode,
  type FlywheelPreflightCheck,
  type HumanDemonstrationBinding,
  type HumanoidCaptureSession,
} from '@/entities/flywheel';
import { getExecutionEnvironmentLabel } from '@/shared/domain';
import { useDataEnvironment } from '@/shared/config';
import { formatBytes, formatRelativeTime } from '@/shared/lib/format';
import { downloadTextFile } from '@/shared/lib/record-export';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Dialog } from '@/shared/ui/dialog';
import { Dropdown } from '@/shared/ui/dropdown';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { PlaybackBar } from '@/shared/ui/playback-bar';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Select } from '@/shared/ui/select';
import { StatusIndicator, type StatusIndicatorTone } from '@/shared/ui/status-indicator';
import { StickyActionBar } from '@/shared/ui/sticky-action-bar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Textarea } from '@/shared/ui/textarea';
import { Tabs, type TabItem } from '@/shared/ui/tabs';
import {
  SynchronizedPlayer,
  type SynchronizedPlayerSource,
} from '@/shared/ui/synchronized-player';

import { AnnotationsPage, QualityPage } from './FlywheelDataPages';
import { DeploymentsPage, InferencePage } from './FlywheelModelPages';
import {
  loadEpisodes,
  loadCollectionOperations,
} from './flywheel-loaders';
import {
  AsyncState,
  DetailLink,
} from './flywheel-page-shared';
import { formatDateTime, formatDuration, VIDEO_SOURCE } from './flywheel-page-utils';
import './collection-workspace.css';
import {
  getCloseIntent,
  type CollectionWorkspaceState,
} from './collection-close-intent';
import { validateCollectionSetup, type CollectionSetupErrors } from './collection-setup-validation';
import { createCollectionSessionExportRecord } from './flywheel-export-records';

const QuestHandPoseViewer = lazy(async () => ({
  default: (await loadQuestHandPoseViewer()).QuestHandPoseViewer,
}));
const CollectionBodyPoseViewer = lazy(async () => ({
  default: (await loadCollectionBodyPoseViewer()).CollectionBodyPoseViewer,
}));

const humanoidCameraSources = [
  {
    id: 'camera-front-rgb',
    imageSrc: '/assets/flywheel/humanoid-camera-front-rgb.png',
    label: '전면 RGB · 전신',
    meta: '30 FPS',
    overlay: 'full-body-skeleton',
    renderMode: 'rgb',
    src: VIDEO_SOURCE,
  },
  {
    id: 'camera-head',
    imageSrc: '/assets/flywheel/humanoid-camera-head-rgb.png',
    label: '헤드 RGB',
    meta: '29.8 FPS',
    renderMode: 'rgb',
    src: VIDEO_SOURCE,
  },
  {
    id: 'camera-head-depth',
    imageSrc: '/assets/flywheel/humanoid-camera-head-depth.png',
    label: '헤드 Depth',
    meta: '29.6 FPS',
    renderMode: 'depth',
    src: VIDEO_SOURCE,
  },
] as const satisfies readonly SynchronizedPlayerSource[];

const humanDemonstrationCameraSources = [
  {
    id: 'rbp-head-rgb',
    imageSrc: '/assets/flywheel/humanoid-camera-head-rgb.png',
    label: 'Head RGB · RBP Camera',
    meta: '30 FPS',
    renderMode: 'rgb',
    src: VIDEO_SOURCE,
  },
  {
    id: 'external-fullbody-rgb',
    imageSrc: '/assets/flywheel/humanoid-camera-front-rgb.png',
    label: 'External RGB · Full body',
    meta: '30 FPS',
    overlay: 'full-body-skeleton',
    renderMode: 'rgb',
    src: VIDEO_SOURCE,
  },
] as const satisfies readonly SynchronizedPlayerSource[];

function sessionSubjectLabel(session: HumanoidCaptureSession): string {
  return session.humanDemonstration === null
    ? session.robotId ?? 'Robot 미지정'
    : `${session.humanDemonstration.participantId} · ${session.humanDemonstration.exoskeletonDeviceId}`;
}

function getCollectionWorkspaceState(
  session: HumanoidCaptureSession,
  activeEpisode: FlywheelEpisode | null,
): CollectionWorkspaceState {
  if (session.status === 'processing') return 'processing';
  if (session.status === 'failed') return 'attention';
  if (activeEpisode?.status === 'recording') return 'recording';
  if (activeEpisode?.status === 'finalizing' && activeEpisode.finalizationError !== null) return 'attention';
  if (activeEpisode?.status === 'finalizing') return 'finalizing';
  if (activeEpisode?.status === 'completed' && activeEpisode.outcome === null) return 'review';
  if ((session.status === 'active' || session.status === 'ready') && activeEpisode === null) return 'episode-ready';
  return 'prepare';
}

function getWorkspaceStateLabel(state: CollectionWorkspaceState): string {
  const labels: Readonly<Record<CollectionWorkspaceState, string>> = {
    prepare: '사전점검이 필요합니다',
    'episode-ready': '녹화 준비 완료',
    recording: '녹화 중',
    finalizing: '파일 확정 중',
    review: '녹화본 검토 대기',
    processing: '세션 처리 중',
    attention: '확인 필요',
  };
  return labels[state];
}

const operationalStatusOrder: Readonly<Record<string, number>> = {
  active: 0,
  recording: 0,
  failed: 1,
  processing: 2,
  ready: 3,
  validating: 4,
  draft: 4,
};

function workspaceTone(state: CollectionWorkspaceState): StatusIndicatorTone {
  if (state === 'recording' || state === 'episode-ready') return 'positive';
  if (state === 'attention') return 'negative';
  if (state === 'finalizing' || state === 'processing' || state === 'review') return 'warning';
  return 'neutral';
}

function defaultSessionName(): string {
  const date = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return `휴머노이드 수집 ${date}`;
}

function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function formatRecordingDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${clock}` : clock;
}

function RecordingElapsedTime({ episode }: { readonly episode: FlywheelEpisode }) {
  const now = useNow();
  const elapsedMs = (episode.endedAtMs ?? now) - episode.startedAtMs;
  return <span className="tabular-nums text-foreground">{formatRecordingDuration(elapsedMs)}</span>;
}

function PairingCountdown({ expiresAtMs }: { readonly expiresAtMs: number | null }) {
  const now = useNow();
  if (expiresAtMs === null) return <span>만료 시각 없음</span>;
  const remainingMs = Math.max(0, expiresAtMs - now);
  return <span>{remainingMs === 0 ? '만료됨' : `${formatRecordingDuration(remainingMs)} 후 만료`}</span>;
}

function CollectionWorkspaceLiveStatus({
  effectiveConnectionState,
  session,
  state,
}: {
  readonly effectiveConnectionState: CollectionTelemetryConnectionState;
  readonly session: HumanoidCaptureSession;
  readonly state: CollectionWorkspaceState;
}) {
  const label = state === 'processing'
    ? session.processingStage === 'indexing' ? '인덱스 생성 중' : '파일 확정 중'
    : getWorkspaceStateLabel(state);
  const connection = effectiveConnectionState === 'live'
    ? '수집 소스 연결 정상'
    : effectiveConnectionState === 'stale'
      ? '수집 소스 갱신 지연'
      : '수집 소스 연결 끊김';

  return (
    <span
      aria-atomic="true"
      aria-label="현재 수집 상태"
      aria-live="polite"
      className="sr-only"
      role="status"
    >
      {label}. {connection}.
    </span>
  );
}

function qualityLabel(snapshot: CollectionTelemetrySnapshot | null): string {
  if (snapshot === null || snapshot.totalSampleCount === 0) return '판정 대기';
  if (snapshot?.qualityVerdict === 'training-ready') return '학습 사용 가능';
  if (snapshot?.qualityVerdict === 'review') return '품질 검토 필요';
  if (snapshot?.qualityVerdict === 'not-ready') return '학습 사용 불가';
  return '판정 대기';
}

function syncLabel(snapshot: CollectionTelemetrySnapshot | null): string {
  if (snapshot?.sync.state === 'aligned') return '동기화 정상';
  if (snapshot?.sync.state === 'warning') return '동기화 확인 필요';
  if (snapshot?.sync.state === 'out-of-sync') return '동기화 범위 이탈';
  return '동기화 정보 없음';
}

function getRecordingSummary(
  session: HumanoidCaptureSession,
  state: CollectionWorkspaceState,
  telemetry: CollectionTelemetrySnapshot | null,
) {
  if (state === 'recording') {
    return { label: '수신 중 · 저장 미확인', detail: `${formatBytes(telemetry?.bytesWritten ?? session.bytesWritten)} 수신`, tone: 'warning' as const };
  }
  if (state === 'finalizing') return { label: '파일 확정 중', detail: '창을 닫지 마세요', tone: 'warning' as const };
  if (state === 'review') return { label: '녹화본 준비 완료', detail: '저장 여부를 결정하세요', tone: 'positive' as const };
  if (state === 'processing') {
    return {
      label: session.processingStage === 'indexing' ? '인덱스 생성 중' : '원본 파일 확정 중',
      detail: formatBytes(telemetry?.bytesWritten ?? session.bytesWritten),
      tone: 'warning' as const,
    };
  }
  return { label: '저장 상태 확인 불가', detail: '저장소의 수신 정보가 연결되지 않았습니다.', tone: 'neutral' as const };
}

function MultimodalTimeline({ telemetry }: { readonly telemetry: CollectionTelemetrySnapshot | null }) {
  const windowMs = telemetry?.timeline.windowMs ?? 10_000;
  const tracks = telemetry?.timeline.tracks ?? [];
  return (
    <section
      aria-label="최근 10초 멀티모달 타임라인"
      className="grid min-h-[7rem] content-center gap-2 rounded-[var(--design-radius-surface)] bg-layer-base px-3 py-3"
      data-multimodal-timeline
    >
      <header className="flex flex-wrap items-center justify-between gap-3 text-xs leading-4 text-muted">
        <span className="font-semibold text-foreground">멀티모달 동기화 · 최근 10초</span>
        <span>필수 소스의 누락과 drift만 강조합니다</span>
      </header>
      {tracks.length === 0 ? (
        <p className="text-xs text-muted">timeline 데이터를 기다리는 중입니다.</p>
      ) : tracks.map((track) => {
        const stream = telemetry?.streams.find((item) => item.streamId === track.streamId);
        const optional = stream?.required === false;
        return (
        <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_5rem] items-center gap-2" key={track.streamId}>
          <span className="break-words text-xs font-medium text-muted">{track.label}</span>
          <div className={`relative h-2 overflow-hidden rounded-[var(--design-radius-round)] ${optional ? 'bg-status-neutral-background' : 'bg-status-positive-background'}`}>
            {track.anomalies.map((anomaly, index) => {
              const left = Math.max(0, Math.min(100, (anomaly.startOffsetMs + windowMs) / windowMs * 100));
              const right = Math.max(0, Math.min(100, (anomaly.endOffsetMs + windowMs) / windowMs * 100));
              return (
                <span
                  aria-label={anomaly.label}
                  className={`absolute inset-y-0 ${optional ? 'bg-status-neutral-foreground' : anomaly.severity === 'critical' ? 'bg-negative' : 'bg-warning'}`}
                  key={`${anomaly.kind}-${String(index)}`}
                  style={{ left: `${String(left)}%`, width: `${String(Math.max(1.5, right - left))}%` }}
                  title={anomaly.label}
                />
              );
            })}
          </div>
          <span className={`text-right text-xs font-semibold ${optional ? 'text-muted' : track.health === 'healthy' ? 'text-positive' : track.health === 'degraded' ? 'text-warning' : 'text-negative'}`}>
            {optional
              ? track.health === 'healthy' ? '선택 · 정상' : '선택 · 미사용'
              : track.health === 'healthy' ? '정상' : track.health === 'degraded' ? '경고' : '단절'}
          </span>
        </div>
        );
      })}
    </section>
  );
}

function HumanoidCollectionPreview({
  ariaLabel,
  cameraSources,
  cameraTitle,
  playbackPlaying,
  playbackPositionMs,
  poseKind = 'rig',
  handPose,
  telemetry = null,
}: {
  readonly ariaLabel: string;
  readonly cameraSources: readonly SynchronizedPlayerSource[];
  readonly cameraTitle: string;
  readonly playbackPlaying?: boolean;
  readonly playbackPositionMs?: number;
  readonly poseKind?: 'rig' | 'quest-hands';
  readonly handPose?: CollectionHandPoseTelemetry | null;
  readonly telemetry?: CollectionTelemetrySnapshot | null;
}) {
  const robotState = telemetry?.streams.find((stream) => (
    stream.streamId === 'robot-state' || stream.streamId === 'exoskeleton-state'
  )) ?? null;
  return (
    <section
      aria-label={ariaLabel}
      className={poseKind === 'quest-hands' ? 'collection-visual-grid' : 'grid h-full min-h-0 grid-cols-2 gap-2'}
    >
      <div
        className="collection-cameras min-h-0 min-w-0 overflow-hidden"
        data-primary-visual="camera"
      >
        <SynchronizedPlayer
          layout="featured"
          presentation="monitoring"
          sources={cameraSources}
          title={cameraTitle}
        />
      </div>

      {poseKind === 'quest-hands' ? (
        <div className="collection-perception min-h-0 min-w-0 overflow-hidden">
          <CollectionPerceptionViewer result={telemetry?.headPerception ?? null} />
        </div>
      ) : null}
      <div
        className="collection-hands min-h-0 min-w-0 overflow-hidden"
        data-primary-visual="pose"
      >
        {poseKind === 'quest-hands' ? (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted" role="status">손 포즈 뷰 준비 중</div>}>
            <QuestHandPoseViewer
              handPose={handPose === undefined ? telemetry?.handPose ?? null : handPose}
              streams={telemetry?.streams ?? []}
              streamState={cameraSources.some((source) => source.status === 'recorded')
                ? 'recorded'
                : telemetry?.connectionState === 'live'
                  ? 'live'
                  : 'idle'}
            />
          </Suspense>
        ) : (
          <HumanoidRigViewer
            active={telemetry?.connectionState === 'live'}
            driftMs={telemetry?.sync.maxDriftMs ?? 0}
            handPose={telemetry?.handPose ?? null}
            poseRateHz={robotState?.observedRateHz ?? null}
            presentation="monitoring"
            showSkeleton
            spatial={telemetry?.spatial ?? null}
            streamState={cameraSources.some((source) => source.status === 'recorded')
              ? 'recorded'
              : telemetry?.connectionState === 'live'
                ? 'live'
                : 'idle'}
            {...(playbackPlaying === undefined ? {} : { playbackPlaying })}
            {...(playbackPositionMs === undefined ? {} : { playbackPositionMs })}
          />
        )}
      </div>
      {poseKind === 'quest-hands' ? (
        <div className="collection-body min-h-0 min-w-0 overflow-hidden">
          <Suspense fallback={<p className="p-3 text-xs text-muted" role="status">전신 뷰 준비 중</p>}>
            <CollectionBodyPoseViewer />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
}

function SessionCollectionPreview({
  ariaLabel,
  cameraSources,
  cameraTitle,
  humanDemonstration,
  playbackPlaying,
  playbackPositionMs,
  replayEpisodeId,
  telemetry,
}: {
  readonly ariaLabel: string;
  readonly cameraSources: readonly SynchronizedPlayerSource[];
  readonly cameraTitle: string;
  readonly humanDemonstration: boolean;
  readonly playbackPlaying: boolean;
  readonly playbackPositionMs: number;
  readonly replayEpisodeId: string | null;
  readonly telemetry: CollectionTelemetrySnapshot | null;
}) {
  const port = useFlywheelPort();
  const [replayHandPose, setReplayHandPose] = useState<{
    readonly episodeId: string;
    readonly frame: CollectionHandPoseTelemetry | null;
  } | null>(null);

  useEffect(() => {
    if (!humanDemonstration || replayEpisodeId === null) return undefined;
    let active = true;
    void port.getEpisodeHandPoseAt(replayEpisodeId, playbackPositionMs).then((frame) => {
      if (active) setReplayHandPose({ episodeId: replayEpisodeId, frame });
    });
    return () => {
      active = false;
    };
  }, [humanDemonstration, playbackPositionMs, port, replayEpisodeId]);
  const displayedReplayPose = replayHandPose?.episodeId === replayEpisodeId
    ? replayHandPose.frame
    : null;

  return (
    <HumanoidCollectionPreview
      ariaLabel={ariaLabel}
      cameraSources={cameraSources}
      cameraTitle={cameraTitle}
      poseKind={humanDemonstration ? 'quest-hands' : 'rig'}
      telemetry={telemetry}
      {...(humanDemonstration && replayEpisodeId !== null ? { handPose: displayedReplayPose } : {})}
      {...(replayEpisodeId === null ? {} : { playbackPlaying, playbackPositionMs })}
    />
  );
}

function streamHealthLabel(stream: CollectionStreamTelemetry): string {
  if (stream.origin === 'derived') {
    if (stream.processingStatus === 'failed') return '후처리 실패';
    if (stream.processingStatus === 'completed') return '파생 처리 완료';
    return '파생 처리 대기';
  }
  if (stream.handTracking !== null && stream.handTracking !== undefined) {
    if (stream.handTracking.qualityState === 'tracking') return '추적 정상';
    if (stream.handTracking.qualityState === 'partial') return '부분 관측';
    return '추적 유실';
  }
  if (stream.connectionState === 'offline') return '오프라인';
  if (stream.connectionState === 'stale') return '지연';
  if (stream.health === 'healthy') return '정상';
  if (stream.health === 'degraded') return '저하';
  return '단절';
}

function streamHealthTone(stream: CollectionStreamTelemetry): 'positive' | 'warning' | 'negative' | 'neutral' {
  if (stream.origin === 'derived') {
    if (stream.processingStatus === 'failed') return 'negative';
    if (stream.processingStatus === 'completed') return 'positive';
    return 'neutral';
  }
  if (stream.handTracking !== null && stream.handTracking !== undefined) {
    if (stream.handTracking.qualityState === 'tracking') return 'positive';
    if (stream.handTracking.qualityState === 'partial') return 'warning';
    return 'negative';
  }
  if (stream.connectionState === 'offline') return stream.required ? 'negative' : 'neutral';
  if (stream.connectionState === 'stale') return 'warning';
  if (stream.health === 'healthy') return 'positive';
  if (stream.health === 'degraded') return 'warning';
  return 'negative';
}

function rateLabel(stream: CollectionStreamTelemetry): string {
  if (stream.origin === 'derived') {
    if (stream.processingStatus === 'completed') return '완료';
    if (stream.processingStatus === 'processing') return '처리 중';
    if (stream.processingStatus === 'failed') return '실패';
    if (stream.processingStatus === 'disabled') return '미사용';
    return '원본 저장 후 실행';
  }
  const unit = stream.modality === 'rgb'
    || stream.modality === 'depth'
    || stream.modality === 'semantic'
    || stream.modality === 'estimated-depth'
    ? 'FPS'
    : 'Hz';
  const observed = stream.observedRateHz === null ? '—' : stream.observedRateHz.toFixed(1);
  const expected = stream.expectedRateHz === null ? '—' : stream.expectedRateHz.toFixed(0);
  return `${observed}/${expected} ${unit}`;
}

function issueGuidance(issueId: string): string {
  if (issueId.startsWith('disconnected-')) return '소스의 전원·네트워크·Collector 상태를 확인하세요.';
  if (issueId.startsWith('degraded-')) return '소스 상세에서 관측률과 연속 누락 시간을 확인하세요.';
  if (issueId.includes('calibration')) return '원본은 보존되지만 학습 사용 전 Calibration 정책 검토가 필요합니다.';
  if (issueId.includes('no-')) return '녹화를 시작한 뒤 필수 소스의 샘플 유입을 확인하세요.';
  if (issueId.includes('sync')) return '허용 drift와 소스별 clock domain을 확인하세요.';
  return '아래 소스 상태와 사전점검 결과를 확인하세요.';
}

function getCollectionIssues({
  actionError,
  preflight,
  refreshError,
  telemetry,
  effectiveConnectionState,
}: {
  readonly actionError: string | null;
  readonly preflight: readonly FlywheelPreflightCheck[];
  readonly refreshError: string | null;
  readonly telemetry: CollectionTelemetrySnapshot | null;
  readonly effectiveConnectionState: CollectionTelemetryConnectionState;
}) {
  const failedChecks = preflight.filter((check) => check.state === 'failed');
  const criticalIssues = telemetry?.qualityIssues.filter((issue) => issue.severity === 'critical') ?? [];
  const warnings = telemetry?.qualityIssues.filter((issue) => issue.severity !== 'critical') ?? [];
  const unhealthySources = telemetry?.streams.filter((stream) => (
    stream.required && stream.origin !== 'derived' && streamHealthTone(stream) !== 'positive'
    && !criticalIssues.some((issue) => issue.streamId === stream.streamId)
  )) ?? [];
  const connectionProblem = refreshError !== null || (telemetry !== null && effectiveConnectionState !== 'live');
  const operationalCount = Number(actionError !== null) + Number(connectionProblem)
    + failedChecks.length + criticalIssues.length + unhealthySources.length;
  return {
    actionError, refreshError, effectiveConnectionState, failedChecks, criticalIssues,
    warnings, unhealthySources, connectionProblem, operationalCount,
    count: operationalCount + warnings.length,
  };
}

function CollectionIssuesSection({ issues, onOpenDetails, expanded = false }: {
  readonly issues: ReturnType<typeof getCollectionIssues>;
  readonly onOpenDetails: () => void;
  readonly expanded?: boolean;
}) {
  const {
    actionError, refreshError, effectiveConnectionState, failedChecks, criticalIssues,
    warnings, unhealthySources, connectionProblem, operationalCount, count,
  } = issues;
  if (count === 0) {
    return expanded ? <p className="py-4 text-sm text-muted">현재 확인할 문제가 없습니다.</p> : null;
  }

  if (!expanded) {
    if (operationalCount === 0) return null;
    const urgent = actionError !== null || failedChecks.length > 0 || criticalIssues.length > 0;
    const firstCheck = failedChecks[0];
    const message = actionError
      ?? (connectionProblem
        ? refreshError ?? (effectiveConnectionState === 'offline' ? '수집 장치 연결 끊김' : '수집 상태 갱신 지연')
        : null)
      ?? (firstCheck === undefined ? null : `${firstCheck.label} · ${firstCheck.detail}`)
      ?? criticalIssues[0]?.message
      ?? (unhealthySources[0] === undefined ? null : `${unhealthySources[0].displayName} · ${streamHealthLabel(unhealthySources[0])}. 장치 연결과 수신 상태를 확인하세요.`)
      ?? '';
    return (
      <section aria-label="현재 문제와 조치" className="collection-issue-notice flex shrink-0 items-start gap-3 rounded-[var(--design-radius-control)] bg-layer-base p-3" data-operational-issues>
        <span className={`mt-0.5 shrink-0 ${urgent ? 'text-negative' : 'text-warning'}`}><Icon name={connectionProblem ? 'wifi-off' : 'events'} /></span>
        <div className="collection-issue-body min-w-0 flex-1">
          <div className="break-words text-xs leading-relaxed" role={urgent ? 'alert' : 'status'}>{actionError === null ? message : <MessageNotice message={actionError} />}</div>
          <a className={getButtonClassName('secondary', 'mt-2')} href="#collection-details" onClick={onOpenDetails}>문제 확인<Icon name="chevron-right" /></a>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="현재 문제와 조치" className="grid shrink-0 gap-2" data-operational-issues>
      {actionError === null ? null : (
        <div className="rounded-[var(--design-radius-control)] bg-status-negative-background px-3 py-2 text-sm text-status-negative-foreground" role="alert">
          <MessageNotice message={actionError} />
          <p className="mt-1 text-xs">원인을 해결한 뒤 다시 시도하세요.</p>
        </div>
      )}
      {connectionProblem ? (
        <p className="rounded-[var(--design-radius-control)] bg-status-warning-background px-3 py-2 text-sm text-status-warning-foreground" role="status">
          {effectiveConnectionState === 'offline' ? '수집 장치 연결 끊김' : '수집 상태 갱신 지연'} · 장치와 네트워크 연결을 확인하세요.
          {refreshError === null ? null : <span className="block text-xs">{refreshError}</span>}
        </p>
      ) : null}
      {failedChecks.map((check) => (
        <p className="rounded-[var(--design-radius-control)] bg-status-negative-background px-3 py-2 text-sm text-status-negative-foreground" key={check.id} role="alert">
          {check.label} · {check.detail}
        </p>
      ))}
      {criticalIssues.map((issue) => (
        <div className="rounded-[var(--design-radius-control)] bg-status-negative-background px-3 py-2 text-sm text-status-negative-foreground" key={issue.id} role="alert">
          <p>{issue.message}</p><p className="mt-1 text-xs">{issueGuidance(issue.id)}</p>
        </div>
      ))}
      {unhealthySources.map((stream) => (
        <p className="rounded-[var(--design-radius-control)] bg-status-warning-background px-3 py-2 text-sm text-status-warning-foreground" key={stream.streamId} role="status">
          {stream.displayName} · {streamHealthLabel(stream)}. 장치 연결과 수신 상태를 확인하세요.
        </p>
      ))}
      {warnings.map((issue) => (
        <div className="rounded-[var(--design-radius-control)] bg-status-warning-background px-3 py-2 text-sm text-status-warning-foreground" key={issue.id}>
          <p>{issue.message}</p><p className="mt-1 text-xs">{issueGuidance(issue.id)}</p>
        </div>
      ))}
    </section>
  );
}

function CollectionStreamsSection({ telemetry }: { readonly telemetry: CollectionTelemetrySnapshot | null }) {
  const streams = telemetry?.streams ?? [];
  const required = streams.filter((stream) => stream.required && stream.origin !== 'derived');
  const optional = streams.filter((stream) => !stream.required && stream.origin !== 'derived');
  const derived = streams.filter((stream) => stream.origin === 'derived');

  const renderStream = (stream: CollectionStreamTelemetry) => (
    <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1 text-xs" key={stream.streamId}>
      <div className="min-w-0">
        <StatusIndicator
          className="max-w-full text-xs"
          label={stream.displayName}
          tone={streamHealthTone(stream)}
          title={stream.displayName}
        />
        <p className="mt-1 break-words text-xs leading-relaxed tabular-nums text-muted">
          {stream.lastSampleAtMs === null ? '수신 기록 없음' : `${formatRelativeTime(stream.lastSampleAtMs)} 수신`}
          {stream.droppedFrameCount + stream.missingSampleCount === 0
            ? ''
            : ` · 프레임 손실 ${String(stream.droppedFrameCount)} · 샘플 누락 ${String(stream.missingSampleCount)}`}
          {stream.handTracking === null || stream.handTracking === undefined || (stream.handTracking.validJointCount === 25 && stream.handTracking.consecutiveMissingMs === 0)
            ? ''
            : ` · 유효 관절 ${String(stream.handTracking.validJointCount)}/25 · 연속 누락 ${String(stream.handTracking.consecutiveMissingMs)} ms`}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-xs font-semibold ${streamHealthTone(stream) === 'positive' ? 'text-positive' : streamHealthTone(stream) === 'warning' ? 'text-warning' : streamHealthTone(stream) === 'negative' ? 'text-negative' : 'text-muted'}`}>
          {streamHealthLabel(stream)}
        </p>
        <p className="text-xs tabular-nums text-muted">{rateLabel(stream)}</p>
      </div>
    </div>
  );

  return (
    <section aria-label="Sensor stream 상태" className="border-t border-border py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">필수 수집 소스</h2>
        <span className="text-xs text-muted">관측 / 목표</span>
      </div>
      <div className="collection-stream-list grid divide-y divide-border">
        {required.map(renderStream)}
        {telemetry !== null ? null : <p className="py-3 text-xs text-muted">장치의 수신 상태를 기다리고 있습니다.</p>}
        {telemetry === null || required.length > 0 ? null : <p className="py-3 text-xs text-muted">필수 수집 소스가 없습니다. 세션의 장치 구성을 확인하세요.</p>}
      </div>
      {[
        { label: '선택 소스', streams: optional },
        { label: '파생 소스', streams: derived },
      ].filter((group) => group.streams.length > 0).map((group) => (
        <details className="collection-inline-details" key={group.label}>
          <summary>{group.label} · {String(group.streams.length)}개</summary>
          <div className="collection-stream-list grid divide-y divide-border">{group.streams.map(renderStream)}</div>
        </details>
      ))}
    </section>
  );
}

function sourceRoleLabel(role: HumanDemonstrationBinding['sourceBindings'][number]['role']): string {
  if (role === 'xr-hand-tracking') return 'XR Hand Pose';
  if (role === 'head-camera') return 'RBP Head Camera';
  if (role === 'external-scene-camera') return 'External Camera';
  return 'Exoskeleton';
}

function SourceBindingsSection({ binding }: { readonly binding: HumanDemonstrationBinding }) {
  return (
      <section aria-label="Human Demonstration source bindings" className="pb-2 pt-3">
        <p className="break-words text-xs leading-relaxed text-muted">Profile · {binding.profile.id}</p>
      <dl className="collection-source-bindings mt-4 grid gap-4 text-xs">
        {binding.sourceBindings.map((source) => (
          <div className="min-w-0" key={source.sourceDeviceId}>
            <dt className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{sourceRoleLabel(source.role)}</span>
            <StatusIndicator
              className="text-xs"
              label={source.state === 'recording' ? '녹화 중' : source.state === 'ready' ? '준비' : source.state === 'paired' ? '페어링 완료' : source.state === 'pending' ? '연결 대기' : source.state === 'stale' ? '갱신 지연' : source.required ? '오프라인' : '미사용'}
              tone={source.state === 'recording' || source.state === 'ready'
                ? 'positive'
                : source.state === 'paired' || source.state === 'pending' || source.state === 'stale'
                  ? 'warning'
                  : source.required ? 'negative' : 'neutral'}
            />
            </dt>
            <dd className="mt-2 grid gap-1 break-words font-mono leading-relaxed text-muted"><span>{source.sourceDeviceId}</span><span>{source.integrationProfileId}</span></dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs font-semibold">Collector 명령 응답</p>
        {binding.collectorAcknowledgements.length === 0 ? (
          <p className="mt-1 text-xs text-muted">Episode command 대기 중</p>
        ) : (
          <ul className="mt-2 grid gap-1 text-xs text-muted">
            {binding.collectorAcknowledgements.slice(-6).map((acknowledgement) => (
              <li className="wrap-anywhere" key={`${acknowledgement.episodeId}-${acknowledgement.sourceDeviceId}-${acknowledgement.command}`}>
                {acknowledgement.sourceDeviceId} · {acknowledgement.command === 'start' ? '시작' : '정지'} · {acknowledgement.state === 'acknowledged' ? '확인 완료' : acknowledgement.state === 'rejected' ? '거절됨' : '응답 대기'}
              </li>
            ))}
          </ul>
        )}
      </div>
      </section>
  );
}

function MessageNotice({ message }: { readonly message: string }) {
  const path = message.match(/\/mlops\/collection\/[^\s]+/u)?.[0] ?? null;
  const label = path === null ? message : message.replace(path, '').trim();
  return (
    <span>
      {label}
      {path === null ? null : (
        <>
          {' '}
          <Link className="underline" to={path}>사용 중인 세션 열기</Link>
        </>
      )}
    </span>
  );
}

function DeleteOperationalSessionButton({
  onDeleted,
  onOpenChange,
  open,
  session,
  trigger,
}: {
  readonly onDeleted?: () => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly session: HumanoidCaptureSession;
  readonly trigger?: ReactNode;
}) {
  const port = useFlywheelPort();
  const [internalOpen, setInternalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogOpen = open ?? internalOpen;
  const setDialogOpen = (nextOpen: boolean): void => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const removeSession = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await port.deleteOperationalSession(session.id);
      setDialogOpen(false);
      onDeleted?.();
    } catch {
      setError('세션을 삭제하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      actions={(
        <Button
          isLoading={pending}
          onClick={() => void removeSession()}
          variant="danger"
        >
          세션 삭제
        </Button>
      )}
      description={
        session.activeEpisodeId === null
          ? '세션과 이 세션에서 수집한 Episode를 영구적으로 삭제합니다.'
          : '현재 기록 중인 Episode를 포함해 세션의 모든 수집 데이터를 영구적으로 삭제합니다.'
      }
      onOpenChange={(nextOpen) => {
        setDialogOpen(nextOpen);
        if (nextOpen) setError(null);
      }}
      open={dialogOpen}
      title={`${session.name} 세션을 삭제하시겠습니까?`}
      {...(trigger === undefined && open === undefined
        ? { trigger: <Button disabled={pending} variant="danger">세션 삭제</Button> }
        : trigger === undefined
          ? {}
          : { trigger })}
    >
      {error === null ? null : <p className="text-sm text-negative" role="alert">{error}</p>}
    </Dialog>
  );
}

function OperationalSessionActions({ session }: { readonly session: HumanoidCaptureSession }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <>
      <Dropdown
        items={[{
          label: '세션 삭제',
          onSelect: () => setDeleteOpen(true),
        }]}
        label={`${session.name} 더보기`}
        trigger={(
          <Button aria-label={`${session.name} 더보기`} className="size-10 min-h-0 p-0" variant="ghost">
            <Icon name="more" />
          </Button>
        )}
      />
      <DeleteOperationalSessionButton
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        session={session}
      />
    </>
  );
}

function listActionLabel(state: CollectionWorkspaceState): string {
  if (state === 'review') return '녹화본 검토';
  if (state === 'attention') return '문제 확인';
  if (state === 'processing' || state === 'finalizing') return '진행 상태';
  if (state === 'recording') return '녹화 계속';
  if (state === 'episode-ready') return '다음 녹화';
  return '설정 계속';
}

function episodeQualitySummary(episodes: readonly FlywheelEpisode[]): {
  readonly label: string;
  readonly needsReview: boolean;
  readonly tone: StatusIndicatorTone;
} {
  if (episodes.some((episode) => episode.qualityStatus === 'failed')) {
    return { label: '품질 실패', needsReview: true, tone: 'negative' };
  }
  if (episodes.some((episode) => episode.qualityStatus === 'quarantined')) {
    return { label: '격리 검토', needsReview: true, tone: 'warning' };
  }
  if (episodes.some((episode) => episode.qualityStatus === 'pending')) {
    return { label: '판정 대기', needsReview: false, tone: 'neutral' };
  }
  if (episodes.length > 0 && episodes.every((episode) => episode.qualityStatus === 'passed')) {
    return { label: '품질 통과', needsReview: false, tone: 'positive' };
  }
  return { label: '데이터 없음', needsReview: false, tone: 'neutral' };
}

function sessionRequiredSourceLabel(session: HumanoidCaptureSession): {
  readonly label: string;
  readonly tone: StatusIndicatorTone;
} {
  if (session.humanDemonstration === null) {
    const passed = session.preflight.length > 0 && session.preflight.every((check) => check.state !== 'failed');
    return passed
      ? { label: '사전점검 통과', tone: 'positive' }
      : { label: '사전점검 필요', tone: 'warning' };
  }
  const required = session.humanDemonstration.sourceBindings.filter((source) => source.required);
  const ready = required.filter((source) => (
    source.state === 'ready' || source.state === 'recording'
  ));
  return {
    label: `${String(ready.length)}/${String(required.length)} Collector 준비`,
    tone: ready.length === required.length ? 'positive' : ready.length === 0 ? 'negative' : 'warning',
  };
}

export function CollectionWorkspacePage() {
  const query = useFlywheelQuery(loadCollectionOperations);
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const stateFilter = params.get('state') ?? 'all';
  const profileFilter = params.get('profile') ?? 'all';
  const siteFilter = params.get('collectionSite') ?? 'all';
  const sort = params.get('sort') ?? 'priority';
  const [exportStatus, setExportStatus] = useState('');
  const [exportError, setExportError] = useState(false);
  const setFilter = (key: string, value: string): void => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === '' || value === 'all' || key === 'sort' && value === 'priority') next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  };
  const unavailable = query.status === 'error' && query.message.includes('지원하지 않는');
  const isEmpty = query.status === 'ready' && query.data.sessions.length === 0;
  const hasFilters = search.length > 0 || stateFilter !== 'all' || profileFilter !== 'all' || siteFilter !== 'all';
  const resetFilters = (): void => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const key of ['q', 'state', 'profile', 'collectionSite']) next.delete(key);
      return next;
    }, { replace: true });
  };

  return (
    <div className="@container grid min-w-0 gap-6">
      <PageHeader
        title="데이터 수집"
        {...(isEmpty ? {} : { description: '진행 중인 세션과 녹화 상태를 확인하세요.' })}
        actions={isEmpty ? undefined : unavailable
          ? <Button disabled title="수집 장치 연결을 먼저 설정해야 합니다.">새 수집</Button>
          : <Link className={getButtonClassName('primary')} to="/mlops/collection/new">새 수집</Link>}
      />
      {query.status === 'loading' ? <QueryFeedback kind="loading" /> : null}
      {query.status === 'error' ? (
        <QueryFeedback
          kind={unavailable ? 'unavailable' : 'error'}
          message={unavailable
            ? '이 환경에서는 수집 장치에 연결할 수 없습니다. 관리자가 수집 서버 연결을 설정해야 합니다.'
            : query.message}
          onRetry={query.retry}
        />
      ) : null}
      {isEmpty ? (
        <section aria-labelledby="collection-empty-title" className="grid gap-5 rounded-[var(--design-radius-surface)] bg-layer-raised p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid gap-2">
              <h2 className="text-xl font-bold text-balance" id="collection-empty-title">진행 중인 수집이 없습니다</h2>
              <p className="text-sm leading-relaxed text-muted">새 세션에서 장치를 연결하고 녹화를 시작하세요.</p>
            </div>
            <Link className={getButtonClassName('primary')} to="/mlops/collection/new">새 수집</Link>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-border pt-3">
            <details className="min-w-0 flex-1 text-sm">
              <summary className="min-h-[var(--layout-control-height)] cursor-pointer content-center rounded-[var(--design-radius-control)] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">수집 절차 안내</summary>
              <ol aria-label="데이터 수집 절차" className="grid list-decimal gap-2 py-3 pl-5 leading-6 text-muted">
                <li>작업 지시와 사용할 장치를 지정합니다.</li>
                <li>장치 연결을 확인하고 에피소드를 녹화합니다.</li>
                <li>녹화본을 검토해 저장하면 데이터 카탈로그에서 확인할 수 있습니다.</li>
              </ol>
            </details>
            <Link className={getButtonClassName('ghost')} to="/mlops/catalog">저장한 데이터 보기</Link>
          </div>
        </section>
      ) : null}
      {query.status === 'ready' && query.data.sessions.length > 0 ? (() => {
          const rows = query.data.sessions.map((session) => {
            const sessionEpisodes = query.data.episodes.filter((episode) => episode.captureSessionId === session.id);
            const activeEpisode = session.activeEpisodeId === null
              ? null
              : sessionEpisodes.find((episode) => episode.id === session.activeEpisodeId) ?? null;
            const quality = episodeQualitySummary(sessionEpisodes);
            const required = sessionRequiredSourceLabel(session);
            const state = getCollectionWorkspaceState(session, activeEpisode);
            return {
              session,
              activeEpisode,
              needsAttention: quality.needsReview
                || state === 'attention'
                || ((state === 'recording' || state === 'episode-ready') && required.tone !== 'positive'),
              quality,
              required,
              state,
            };
          });
          const counts = {
            all: rows.length,
            recording: rows.filter((row) => row.state === 'recording').length,
            attention: rows.filter((row) => row.needsAttention).length,
            review: rows.filter((row) => row.state === 'review').length,
            processing: rows.filter((row) => row.state === 'processing' || row.state === 'finalizing').length,
          };
          const normalizedSearch = search.trim().toLocaleLowerCase('ko-KR');
          const profileOptions = [...new Set(rows.map(({ session }) => session.sensorPresetId))];
          const siteOptions = [...new Set(rows.map(({ session }) => session.siteId))];
          const filtered = rows.filter(({ needsAttention, session, state }) => {
            const matchesSearch = normalizedSearch.length === 0
              || [session.name, session.taskId, sessionSubjectLabel(session)]
                .some((value) => value.toLocaleLowerCase('ko-KR').includes(normalizedSearch));
            const matchesState = stateFilter === 'all'
              || stateFilter === state
              || (stateFilter === 'attention' && needsAttention)
              || (stateFilter === 'processing' && (state === 'processing' || state === 'finalizing'));
            const matchesProfile = profileFilter === 'all' || session.sensorPresetId === profileFilter;
            const matchesSite = siteFilter === 'all' || session.siteId === siteFilter;
            return matchesSearch && matchesState && matchesProfile && matchesSite;
          });
          const sorted = [...filtered].sort((left, right) => {
            if (sort === 'name') return left.session.name.localeCompare(right.session.name, 'ko-KR');
            if (sort === 'recent') return right.session.updatedAtMs - left.session.updatedAtMs;
            const stateDifference = (operationalStatusOrder[left.session.status] ?? 99)
              - (operationalStatusOrder[right.session.status] ?? 99);
            if (stateDifference !== 0) return stateDifference;
            if (left.needsAttention !== right.needsAttention) {
              return left.needsAttention ? -1 : 1;
            }
            return right.session.updatedAtMs - left.session.updatedAtMs;
          });
          return (
            <div className="grid min-w-0 gap-6">
              <section aria-label="수집 운영 요약" className="grid grid-cols-2 gap-3 @min-[46rem]:grid-cols-5">
                {([
                  { label: '전체 세션', count: counts.all, value: 'all', tone: 'neutral' },
                  { label: '녹화 중', count: counts.recording, value: 'recording', tone: counts.recording > 0 ? 'positive' : 'neutral' },
                  { label: '확인 필요', count: counts.attention, value: 'attention', tone: counts.attention > 0 ? 'negative' : 'neutral' },
                  { label: '검토 대기', count: counts.review, value: 'review', tone: counts.review > 0 ? 'warning' : 'neutral' },
                  { label: '처리 중', count: counts.processing, value: 'processing', tone: counts.processing > 0 ? 'info' : 'neutral' },
                ] satisfies readonly { label: string; count: number; value: string; tone: StatusIndicatorTone }[]).map(({ label, count, value, tone }) => (
                  <Button
                    aria-label={`${label} ${String(count)}개`}
                    aria-pressed={stateFilter === value}
                    className={`min-w-0 justify-start whitespace-normal px-4 py-4 ${value === 'all' ? 'col-span-2 @min-[46rem]:col-span-1' : ''} ${stateFilter === value ? 'ring-2 ring-inset ring-focus' : ''}`}
                    key={value}
                    onClick={() => setFilter('state', value)}
                    variant="secondary"
                  >
                    <span className="flex w-full items-center justify-between gap-3 text-start @min-[46rem]:grid">
                      <StatusIndicator className="text-xs" label={label} tone={tone} />
                      <span className="text-2xl font-bold tabular-nums">{count}</span>
                    </span>
                  </Button>
                ))}
              </section>
              <section aria-labelledby="collection-list-title" className="grid min-w-0 gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-base font-bold" id="collection-list-title">진행 중인 세션</h2>
                  <p className="text-sm tabular-nums text-muted" role="status">전체 {rows.length}개 중 {sorted.length}개 표시</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" disabled={sorted.length === 0} onClick={() => {
                    try {
                      downloadTextFile('collection-sessions.json', JSON.stringify(sorted.map(({ session }) => createCollectionSessionExportRecord(session)), null, 2), 'application/json');
                      setExportStatus(`현재 표시된 세션 ${String(sorted.length)}개의 기록 정보를 내보냈습니다.`);
                      setExportError(false);
                    } catch {
                      setExportStatus('기록 정보를 내보내지 못했습니다. 다시 시도하세요.');
                      setExportError(true);
                    }
                  }}><Icon name="download" />수집 세션 JSON 내보내기</Button>
                  <Link className={getButtonClassName('ghost')} to="/mlops/catalog">저장된 데이터 보기<Icon name="chevron-right" /></Link>
                </div>
              </div>
              {exportStatus ? <p className={`text-sm ${exportError ? 'text-negative' : 'text-muted'}`} role={exportError ? 'alert' : 'status'}>{exportStatus}</p> : null}
              <div className="grid min-w-0 gap-3 @min-[30rem]:grid-cols-2 @min-[58rem]:grid-cols-[minmax(14rem,1.5fr)_repeat(3,minmax(0,1fr))]">
                <Input
                  className="min-w-0 flex-1"
                  inputClassName="text-base sm:text-sm"
                  label="수집 검색"
                  leadingIcon="search"
                  onChange={(event) => setFilter('q', event.target.value)}
                  placeholder="세션, 작업, 로봇 또는 참여자"
                  value={search}
                />
                <Select
                  label="상태 필터"
                  onValueChange={(value) => setFilter('state', value)}
                  options={[
                    { label: '전체 상태', value: 'all' },
                    { label: '녹화 중', value: 'recording' },
                    { label: '확인 필요', value: 'attention' },
                    { label: '검토 대기', value: 'review' },
                    { label: '처리 중', value: 'processing' },
                    { label: '사전점검 필요', value: 'prepare' },
                    { label: '녹화 준비 완료', value: 'episode-ready' },
                  ]}
                  className="min-w-0"
                  value={stateFilter}
                />
                <Select
                  label="센서 프로필"
                  onValueChange={(value) => setFilter('profile', value)}
                  options={[
                    { label: '전체 프로필', value: 'all' },
                    ...profileOptions.map((profile) => ({ label: profile, value: profile })),
                  ]}
                  className="min-w-0"
                  value={profileFilter}
                />
                <Select
                  label="수집 장소"
                  onValueChange={(value) => setFilter('collectionSite', value)}
                  options={[
                    { label: '전체 장소', value: 'all' },
                    ...siteOptions.map((site) => ({ label: site, value: site })),
                  ]}
                  className="min-w-0"
                  value={siteFilter}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Select className="w-44" label="세션 정렬" showLabel={false} value={sort} onValueChange={(value) => setFilter('sort', value)} options={[
                  { label: '진행 상태 우선', value: 'priority' },
                  { label: '최근 갱신 순', value: 'recent' },
                  { label: '세션 이름순', value: 'name' },
                ]} />
                {hasFilters ? <Button onClick={resetFilters} variant="ghost"><Icon name="close" />검색·필터 초기화</Button> : null}
              </div>
              {sorted.length === 0 ? (
                <div className="rounded-[var(--design-radius-surface)] bg-layer-raised">
                  <QueryFeedback kind="filtered-empty" message={search.trim() ? `‘${search.trim()}’ 검색 결과가 없습니다. 검색·필터를 초기화해 전체 세션을 확인하세요.` : '선택한 조건의 세션이 없습니다. 검색·필터를 초기화해 전체 세션을 확인하세요.'} />
                </div>
              ) : (
              <Table aria-label="운영 중인 휴머노이드 수집 세션" className="block w-full text-start text-sm @min-[58rem]:table @min-[58rem]:table-fixed">
                <TableHeader className="sr-only bg-surface-muted text-muted @min-[58rem]:not-sr-only @min-[58rem]:table-header-group">
                  <TableRow>
                    <TableHead className="w-[33%] px-4 py-3 text-start font-semibold">세션·작업</TableHead>
                    <TableHead className="w-[23%] px-4 py-3 text-start font-semibold">현재 단계</TableHead>
                    <TableHead className="w-[24%] px-4 py-3 text-start font-semibold">소스·품질</TableHead>
                    <TableHead className="px-4 py-3 text-start font-semibold">다음 작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="block divide-y divide-border @min-[58rem]:table-row-group">
                  {sorted.map(({ activeEpisode, needsAttention, quality, required, session, state }) => {
                    return (
                      <TableRow className="grid gap-4 p-4 @min-[30rem]:grid-cols-2 @min-[58rem]:table-row" key={session.id}>
                        <TableCell className="block min-w-0 @min-[30rem]:col-span-2 @min-[58rem]:table-cell @min-[58rem]:px-4 @min-[58rem]:py-5">
                          <div className="break-words font-semibold">
                          <DetailLink to={`/mlops/collection/${session.id}`}>
                            {session.name}
                          </DetailLink>
                          </div>
                          <p className="mt-1 break-words text-xs leading-relaxed text-muted">
                            {session.taskId} · {sessionSubjectLabel(session)}
                          </p>
                          <p className="mt-2 text-xs leading-relaxed text-muted">
                            {getExecutionEnvironmentLabel(session.provenance.environment)} · <time dateTime={new Date(session.updatedAtMs).toISOString()} title={formatDateTime(session.updatedAtMs)}>{formatRelativeTime(session.updatedAtMs, now)} 갱신</time>
                          </p>
                        </TableCell>
                        <TableCell className="block min-w-0 @min-[58rem]:table-cell @min-[58rem]:px-4 @min-[58rem]:py-5">
                          <p aria-hidden="true" className="mb-2 text-xs text-muted @min-[58rem]:hidden">현재 단계</p>
                          <StatusIndicator label={getWorkspaceStateLabel(state)} tone={workspaceTone(state)} />
                          <p className="mt-1 break-words text-xs leading-relaxed text-muted">{activeEpisode?.name ?? '녹화 중인 Episode 없음'}</p>
                        </TableCell>
                        <TableCell className="block min-w-0 @min-[58rem]:table-cell @min-[58rem]:px-4 @min-[58rem]:py-5">
                          <p aria-hidden="true" className="mb-2 text-xs text-muted @min-[58rem]:hidden">소스·품질</p>
                          <div className="grid gap-2">
                            <StatusIndicator label={required.label} tone={required.tone} />
                            <StatusIndicator label={quality.label} tone={quality.tone} />
                          </div>
                        </TableCell>
                        <TableCell className="block min-w-0 @min-[30rem]:col-span-2 @min-[58rem]:table-cell @min-[58rem]:px-4 @min-[58rem]:py-5">
                          <div className="flex items-center justify-between gap-2">
                          <Link className={getButtonClassName('secondary', 'px-2')} to={`/mlops/collection/${session.id}`}>
                            {listActionLabel(needsAttention ? 'attention' : state)}
                            <Icon name="chevron-right" />
                          </Link>
                          <OperationalSessionActions session={session} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              )}
              </section>
            </div>
          );
        })() : null}
    </div>
  );
}

function sourceBindingStatus(source: HumanDemonstrationBinding['sourceBindings'][number]): {
  readonly label: string;
  readonly tone: StatusIndicatorTone;
} {
  if (source.state === 'recording') return { label: '녹화 중', tone: 'positive' };
  if (source.state === 'ready') return { label: '준비', tone: 'positive' };
  if (source.state === 'paired') return { label: '페어링 완료', tone: 'warning' };
  if (source.state === 'stale') return { label: '갱신 지연', tone: 'warning' };
  if (source.state === 'pending') return { label: '연결 대기', tone: 'warning' };
  return source.required
    ? { label: source.state === 'error' ? '오류' : '오프라인', tone: 'negative' }
    : { label: source.state === 'error' ? '오류' : '미사용', tone: source.state === 'error' ? 'warning' : 'neutral' };
}

function SetupSourceRow({
  source,
}: {
  readonly source: HumanDemonstrationBinding['sourceBindings'][number];
}) {
  const status = sourceBindingStatus(source);
  return (
    <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{sourceRoleLabel(source.role)}</p>
          <span className="text-xs text-muted">{source.required ? '필수' : '선택'}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {source.sourceDeviceId}
          {source.lastSeenAtMs === null ? ' · 수신 기록 없음' : ` · ${formatRelativeTime(source.lastSeenAtMs)} 확인`}
        </p>
      </div>
      {status.tone === 'positive' ? <span className="text-sm text-muted">{status.label}</span> : <StatusIndicator label={status.label} tone={status.tone} />}
    </div>
  );
}

function NewCollectionReadinessStage({
  session,
}: {
  readonly session: HumanoidCaptureSession;
}) {
  const telemetryQuery = useCollectionTelemetry(session.id);
  const telemetry = telemetryQuery.status === 'ready' ? telemetryQuery.data : null;
  const binding = session.humanDemonstration;
  if (binding === null) return null;
  const requiredSources = binding.sourceBindings.filter((source) => source.required);
  const readySources = requiredSources.filter((source) => {
    const status = sourceBindingStatus(source);
    return status.tone === 'positive';
  });
  const allRequiredReady = readySources.length === requiredSources.length;
  const cameraSources = humanDemonstrationCameraSources
    .filter((source) => source.id !== 'external-fullbody-rgb'
      || binding.sourceBindings.some((item) => (
        item.role === 'external-scene-camera'
        && (item.state === 'ready' || item.state === 'recording')
      )))
    .map((source) => {
      const stream = telemetry?.streams.find((item) => item.streamId === source.id);
      return {
        ...source,
        meta: stream === undefined
          ? source.meta
          : `${stream.observedRateHz?.toFixed(1) ?? '—'}/${stream.expectedRateHz?.toFixed(0) ?? '—'} FPS`,
        status: stream?.connectionState === 'live' ? 'live' as const : 'offline' as const,
      };
    });

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden p-4" aria-label="장치 준비 상태">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">
            {allRequiredReady ? '필수 장치 준비 완료' : `필수 장치 ${String(readySources.length)}/${String(requiredSources.length)} 준비`}
          </h2>
        </div>
        <StatusIndicator
          label={session.status === 'ready' ? '사전점검 완료' : allRequiredReady ? '사전점검 실행 가능' : '장치 연결 필요'}
          tone={allRequiredReady ? 'positive' : 'warning'}
        />
      </header>

      <div className="grid divide-y divide-border border-y border-border xl:grid-cols-2 xl:gap-x-4" data-readiness-sources>
        {binding.sourceBindings.map((source) => <SetupSourceRow key={source.sourceDeviceId} source={source} />)}
      </div>

      {allRequiredReady ? (
        <div className="min-h-0 overflow-hidden">
          <HumanoidCollectionPreview
            ariaLabel="연결된 수집 장비 미리보기"
            cameraSources={cameraSources}
            cameraTitle="연결된 장치 미리보기"
            poseKind="quest-hands"
            telemetry={telemetry}
          />
        </div>
      ) : (
        <div className="grid min-h-0 place-items-center px-6 text-center">
          <p className="text-sm text-muted">장치 미리보기 대기</p>
        </div>
      )}
    </section>
  );
}

export function NewHumanoidCollectionPage() {
  const port = useFlywheelPort();
  const dataEnvironment = useDataEnvironment();
  const navigate = useNavigate();
  const [name, setName] = useState(defaultSessionName);
  const [taskId, setTaskId] = useState('');
  const [instruction, setInstruction] = useState('');
  const [exoskeletonDeviceId, setExoskeletonDeviceId] = useState('');
  const [questDeviceId, setQuestDeviceId] = useState('');
  const [headCameraDeviceId, setHeadCameraDeviceId] = useState('');
  const [externalCameraDeviceId, setExternalCameraDeviceId] = useState('');
  const [exampleLoaded, setExampleLoaded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CollectionSetupErrors>({});
  const submissionRef = useRef(false);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadCreatedSession = useCallback((flywheelPort: ReturnType<typeof useFlywheelPort>) => (
    createdSessionId === null
      ? Promise.resolve(null)
      : flywheelPort.getSession(createdSessionId)
  ), [createdSessionId]);
  const createdSessionQuery = useFlywheelQuery(loadCreatedSession);
  const createdSession = createdSessionQuery.status === 'ready'
    && createdSessionQuery.data?.kind === 'humanoid'
    ? createdSessionQuery.data
    : null;
  const binding = createdSession?.humanDemonstration ?? null;
  const pairingCode = binding?.pairing.code ?? null;
  const requiredSources = binding?.sourceBindings.filter((source) => source.required) ?? [];
  const requiredSourcesReady = requiredSources.length > 0 && requiredSources.every((source) => (
    source.state === 'ready' || source.state === 'recording'
  ));
  const submitLabel = createdSession === null
    ? '세션 생성'
    : !requiredSourcesReady
      ? binding?.sourceBindings.some((source) => source.role === 'xr-hand-tracking' && source.state === 'paired')
        ? 'Quest MR 준비 대기'
        : 'Quest 페어링 대기'
      : createdSession.status === 'ready'
        ? '수집 콘솔 열기'
        : '사전점검 실행';

  return (
    <ColorSchemeArea
      className="flex h-dvh min-h-0 flex-col overflow-hidden"
      layer="base"
      scheme="dark"
    >
      <header
        className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 text-foreground sm:px-4"
        data-collection-header
      >
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold sm:text-lg">새 데이터 수집</h1>
          <p className="truncate text-xs text-muted">
            {createdSession === null
              ? `1. 작업과 장치 설정${dataEnvironment === 'simulation' ? ' · 시뮬레이션' : ''}`
              : `${requiredSourcesReady ? '3. 사전점검' : '2. 장치 연결'} · ${getExecutionEnvironmentLabel(createdSession.provenance.environment)}`}
          </p>
        </div>
        <Link
          aria-label="수집 설정 취소"
          className={getButtonClassName('ghost', 'size-10 min-h-0 shrink-0 p-0')}
          title="수집 설정 취소"
          to="/mlops/collection"
        >
          <Icon name="close" size="md" />
        </Link>
      </header>
      <div
        className={createdSession === null
          ? 'grid min-h-0 flex-1 overflow-hidden'
          : 'grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden md:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.5fr)]'}
        data-capture-setup
      >
        <aside
          aria-label="새 수집 세션 설정"
          className="min-h-0 bg-layer-raised"
        >
          <form
              className="flex h-full min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                if (submissionRef.current) return;
                if (createdSession !== null) {
                  if (!requiredSourcesReady) return;
                  if (createdSession.status === 'ready') {
                    void navigate(`/mlops/collection/${createdSession.id}`);
                    return;
                  }
                  setPending(true);
                  submissionRef.current = true;
                  setError(null);
                  void port.validateSession(createdSession.id).then(() => {
                    setPending(false);
                    submissionRef.current = false;
                  }).catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : '사전점검을 완료하지 못했습니다.');
                    setPending(false);
                    submissionRef.current = false;
                  });
                  return;
                }
                if (createdSessionId !== null) return;
                const fields = { name, taskId, instruction, exoskeletonDeviceId, questDeviceId, headCameraDeviceId, externalCameraDeviceId };
                const errors = validateCollectionSetup(fields);
                setFieldErrors(errors);
                if (Object.keys(errors).length > 0) {
                  event.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus();
                  return;
                }
                submissionRef.current = true;
                setPending(true);
                setError(null);
                const createSession = port.createHumanDemonstrationSession({
                  projectId: 'project-tiger',
                  siteId: 'site-lab',
                  name: name.trim(),
                  taskId: taskId.trim(),
                  instruction: instruction.trim(),
                  exoskeletonDeviceId: exoskeletonDeviceId.trim(),
                  questDeviceId: questDeviceId.trim(),
                  headCameraDeviceId: headCameraDeviceId.trim(),
                  externalCameraDeviceId: externalCameraDeviceId.trim(),
                  profileId: 'human-demo-quest-hand-v1',
                });
                void createSession.then((session) => {
                  setCreatedSessionId(session.id);
                  setPending(false);
                  submissionRef.current = false;
                }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : '세션을 생성하지 못했습니다.');
                  setPending(false);
                  submissionRef.current = false;
                });
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                {createdSession === null ? (
                  <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 md:gap-10">
                    <section>
                      <h2 className="text-base font-bold">작업 정의</h2>
                      {dataEnvironment === 'simulation' ? (
                        <div className="mt-3 grid justify-items-start gap-2">
                          <Button type="button" variant="secondary" disabled={pending || createdSessionId !== null} onClick={() => {
                            setTaskId('task-sort-fruit');
                            setInstruction('과일을 종류에 맞는 트레이에 분류하세요.');
                            setExoskeletonDeviceId('exoskeleton-001');
                            setQuestDeviceId('quest2-001');
                            setHeadCameraDeviceId('rbp-headcam-001');
                            setExternalCameraDeviceId('external-camera-001');
                            setExampleLoaded(true);
                            setFieldErrors({});
                          }}>시뮬레이션 예시 불러오기</Button>
                          <p className="text-xs text-muted" role="status">{exampleLoaded ? '예시 작업과 장치 ID를 불러왔습니다. 실제 장치에 연결되지 않습니다.' : '예시 작업과 장치 ID로 수집 흐름을 확인할 수 있습니다.'}</p>
                        </div>
                      ) : null}
                    <div className="mt-4 grid gap-4">
                      <Input label="세션 이름" name="name" {...(fieldErrors.name ? { error: fieldErrors.name } : {})} disabled={pending || createdSessionId !== null} value={name} onChange={(event) => setName(event.target.value)} required />
                      <Input label="작업 ID" name="taskId" {...(fieldErrors.taskId ? { error: fieldErrors.taskId } : {})} disabled={pending || createdSessionId !== null} value={taskId} onChange={(event) => setTaskId(event.target.value)} required />
                      <Textarea label="작업 지시" name="instruction" aria-invalid={fieldErrors.instruction ? true : undefined} aria-describedby={fieldErrors.instruction ? 'collection-instruction-error' : undefined} disabled={pending || createdSessionId !== null} value={instruction} onChange={(event) => setInstruction(event.target.value)} required />
                      {fieldErrors.instruction ? <p className="text-sm text-negative" id="collection-instruction-error">{fieldErrors.instruction}</p> : null}
                    </div>
                    </section>
                    <section>
                      <h2 className="text-base font-bold">수집 장치 연결</h2>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        세션 생성 후 Quest 연결 코드가 발급됩니다.
                      </p>
                      <div className="mt-4 grid gap-3">
                        <Input label="외골격 장치 ID" name="exoskeletonDeviceId" {...(fieldErrors.exoskeletonDeviceId ? { error: fieldErrors.exoskeletonDeviceId } : {})} disabled={pending || createdSessionId !== null} value={exoskeletonDeviceId} onChange={(event) => setExoskeletonDeviceId(event.target.value)} required />
                        <Input label="Quest 손 추적 장치 ID" name="questDeviceId" {...(fieldErrors.questDeviceId ? { error: fieldErrors.questDeviceId } : {})} disabled={pending || createdSessionId !== null} value={questDeviceId} onChange={(event) => setQuestDeviceId(event.target.value)} required />
                        <Input label="RBP 헤드 카메라 ID" name="headCameraDeviceId" {...(fieldErrors.headCameraDeviceId ? { error: fieldErrors.headCameraDeviceId } : {})} disabled={pending || createdSessionId !== null} value={headCameraDeviceId} onChange={(event) => setHeadCameraDeviceId(event.target.value)} required />
                        <Input label="외부 카메라 ID · 선택" name="externalCameraDeviceId" {...(fieldErrors.externalCameraDeviceId ? { error: fieldErrors.externalCameraDeviceId } : {})} disabled={pending || createdSessionId !== null} value={externalCameraDeviceId} onChange={(event) => setExternalCameraDeviceId(event.target.value)} />
                      </div>
                      <p className="mt-4 text-xs leading-5 text-muted">
                        참여자 ID는 세션마다 가명으로 발급됩니다.
                      </p>
                    </section>
                  </div>
                ) : (
                  <div className="grid gap-4" aria-live="polite">
                    <div>
                      <h2 className="text-base font-bold">Quest 연결</h2>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {requiredSourcesReady ? '필수 장치가 연결되었습니다. 사전점검 결과를 확인하세요.' : 'Quest의 수집 앱을 이 세션에 연결하세요.'}
                      </p>
                    </div>
                    <div className={requiredSourcesReady ? 'flex flex-wrap items-center justify-between gap-2 border-y border-border py-3' : 'border-y border-border py-5 text-center'}>
                      <p className="text-sm text-muted">Quest 연결 코드</p>
                      <output
                        aria-label="Quest pairing code"
                        className="block font-mono text-2xl font-bold tracking-[0.16em] tabular-nums"
                      >
                        {pairingCode}
                      </output>
                      <p className="mt-2 text-xs text-muted">
                        <PairingCountdown expiresAtMs={binding?.pairing.expiresAtMs ?? null} />
                      </p>
                    </div>
                    {requiredSourcesReady ? null : <p className="text-sm leading-6 text-muted">
                      Quest 브라우저에서 이 플랫폼의{' '}
                      <code className="font-mono text-foreground">/collect/quest</code>를 열고 위 6자리 코드를 입력하세요.
                    </p>}
                    {createdSession.preflight.length === 0 ? null : (
                      <section>
                        <h3 className="text-sm font-semibold">최근 사전점검</h3>
                        <div className="mt-2 divide-y divide-border">
                          {createdSession.preflight.map((check) => (
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5" key={check.id}>
                              <div>
                                <p className="text-sm font-medium">{check.label}</p>
                                <p className="mt-0.5 text-xs text-muted">{check.detail}</p>
                              </div>
                              {check.state === 'passed' ? <span className="text-sm text-muted">통과</span> : <StatusIndicator
                                label={check.state === 'warning' ? '검토' : '실패'}
                                tone={check.state === 'warning' ? 'warning' : 'negative'}
                              />}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
              <StickyActionBar aria-label="새 수집 작업" position="contained">
                {createdSession === null ? null : (
                  <div className="mb-2 md:hidden">
                    <Dialog title="장치 준비 상태" description="연결된 장치와 수신 상태를 확인하세요." trigger={<Button className="w-full" variant="secondary">장치 준비 상태 보기</Button>}>
                      <div className="h-[60dvh]"><NewCollectionReadinessStage session={createdSession} /></div>
                    </Dialog>
                  </div>
                )}
                {error === null ? null : <p className="mb-3 text-sm text-negative" role="alert"><MessageNotice message={error} /></p>}
                {createdSessionId !== null && createdSession === null && (createdSessionQuery.status === 'error' || createdSessionQuery.refreshError !== null) ? <QueryFeedback kind="error" message="세션을 만들었지만 연결 정보를 불러오지 못했습니다. 다시 조회하세요." onRetry={createdSessionQuery.retry} /> : null}
                <Button
                  className={createdSession === null ? 'w-full md:ms-auto md:flex md:w-64' : 'w-full'}
                  disabled={createdSessionId !== null && createdSession === null || createdSession !== null && !requiredSourcesReady}
                  isLoading={pending || createdSessionId !== null && (createdSessionQuery.status === 'loading' || createdSessionQuery.isRefreshing)}
                  type="submit"
                >
                  {submitLabel}
                </Button>
                {createdSession !== null && !requiredSourcesReady && binding?.sourceBindings.some((source) => source.role === 'xr-hand-tracking' && source.state === 'paired') ? (
                  <p className="mt-2 text-center text-xs text-muted">
                    Quest에서 MR 모드를 시작해 손 추적을 준비하세요.
                  </p>
                ) : null}
              </StickyActionBar>
          </form>
        </aside>

        {createdSession === null ? null : (
          <div className="hidden min-h-0 bg-layer-base md:block" data-setup-preview>
            <NewCollectionReadinessStage session={createdSession} />
          </div>
        )}
      </div>
    </ColorSchemeArea>
  );
}

export function HumanoidCollectionDetailPage() {
  const { sessionId = '' } = useParams();
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const telemetryQuery = useCollectionTelemetry(sessionId);
  const loadSession = useCallback((value: ReturnType<typeof useFlywheelPort>) => value.getSession(sessionId), [sessionId]);
  const sessionQuery = useFlywheelQuery(loadSession);
  const episodesQuery = useFlywheelQuery(loadEpisodes);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [detailsTab, setDetailsTab] = useState('session');
  const [pending, setPending] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);
  const [retakeDialogOpen, setRetakeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [reviewPositionMs, setReviewPositionMs] = useState(0);
  const [actionStatus, setActionStatus] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const episodeData = episodesQuery.status === 'ready' ? episodesQuery.data : null;
  const telemetry = telemetryQuery.status === 'ready' ? telemetryQuery.data : null;
  const sessionErrorMessage = sessionQuery.status === 'ready'
    && sessionQuery.data?.kind === 'humanoid'
    ? sessionQuery.data.errorMessage
    : null;

  const episodes = useMemo(() => {
    if (episodeData === null) return [];
    return episodeData
      .filter((episode) => episode.captureSessionId === sessionId)
      .sort((left, right) => left.startedAtMs - right.startedAtMs);
  }, [episodeData, sessionId]);

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setPending(true);
    setActionError(null);
    try {
      await action();
      setActionStatus(success);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '작업을 완료하지 못했습니다.';
      setActionError(message);
      return false;
    } finally {
      setPending(false);
    }
  }

  const visibleActionError = actionError !== null
    && telemetryQuery.effectiveConnectionState === 'live'
    && (actionError.includes('source 연결') || actionError.includes('stream 연결'))
    ? null
    : actionError ?? sessionErrorMessage;

  return (
    <AsyncState query={sessionQuery} emptyMessage="수집 세션을 찾을 수 없습니다.">
      {(captureSession) => {
        if (captureSession.kind !== 'humanoid') return <Navigate replace to="/mlops/collection" />;
        if (captureSession.status === 'completed') {
          return <Navigate replace to={`/mlops/catalog/${captureSession.id}`} />;
        }
        if (captureSession.status === 'abandoned') return <Navigate replace to="/mlops/collection" />;

        const session = captureSession;
        const activeEpisode = session.activeEpisodeId === null
          ? null
          : episodes.find((episode) => episode.id === session.activeEpisodeId) ?? null;
        const reviewEpisode = activeEpisode?.status === 'completed'
          && activeEpisode.outcome === null
          ? activeEpisode
          : null;
        const savedEpisodes = episodes.filter((episode) => (
          episode.status === 'completed'
          && episode.id !== session.activeEpisodeId
          && episode.outcome !== 'aborted'
          && episode.outcome !== 'failure'
        ));
        const shouldRetryProcessing = session.status === 'failed'
          && session.stoppedAtMs !== null
          && savedEpisodes.length > 0;
        const canRunPreflight = session.status === 'draft'
          || (session.status === 'failed' && !shouldRetryProcessing);
        const requiredSourcesOperational = session.humanDemonstration === null
          || sessionRequiredSourceLabel(session).tone === 'positive';
        const preflightSourceBlocked = canRunPreflight && !requiredSourcesOperational;
        const canStartEpisode = episodeData !== null && session.activeEpisodeId === null
          && (session.status === 'active' || session.status === 'ready')
          && requiredSourcesOperational;
        const workspaceState = getCollectionWorkspaceState(session, activeEpisode);
        const recordingSummary = getRecordingSummary(session, workspaceState, telemetry);
        const closeIntent = getCloseIntent(workspaceState, savedEpisodes.length);
        const recordedPreview = activeEpisode?.status === 'finalizing'
          || workspaceState === 'review';
        const livePreview = (session.status === 'active' || session.status === 'ready') && !recordedPreview;
        const configuredCameraSources = session.humanDemonstration === null
          ? humanoidCameraSources
          : humanDemonstrationCameraSources.filter((source) => (
            source.id !== 'external-fullbody-rgb'
            || session.humanDemonstration?.sourceBindings.some((binding) => (
              binding.role === 'external-scene-camera'
              && (binding.state === 'paired' || binding.state === 'ready' || binding.state === 'recording')
            ))
          ));
        const cameraSources = configuredCameraSources.map((source) => {
          const stream = telemetry?.streams.find((item) => item.streamId === source.id);
          const status = recordedPreview
            ? 'recorded' as const
            : livePreview && stream?.connectionState === 'live'
              ? 'live' as const
              : source.id === 'external-fullbody-rgb'
                ? 'idle' as const
                : 'offline' as const;
          return { ...source, meta: '', status };
        });
        const performClosePrimary = async (): Promise<void> => {
          setPending(true);
          setExitError(null);
          try {
            if (closeIntent.kind === 'stop-recording') {
              if (activeEpisode === null) throw new Error('정지할 Episode를 찾을 수 없습니다.');
              await port.stopEpisode(activeEpisode.id);
              setActionStatus('녹화를 정지하고 수집 목록으로 이동했습니다.');
              setExitDialogOpen(false);
              void navigate('/mlops/collection');
              return;
            }
            if (closeIntent.kind === 'save-review-and-finish') {
              if (reviewEpisode === null) throw new Error('저장할 녹화본을 찾을 수 없습니다.');
              const beforeSave = await port.getSession(session.id);
              if (beforeSave?.kind === 'humanoid' && beforeSave.activeEpisodeId === reviewEpisode.id) {
                await port.saveEpisode(reviewEpisode.id);
              }
              const beforeStop = await port.getSession(session.id);
              if (beforeStop?.status === 'active' || beforeStop?.status === 'recording') {
                await port.stopSession(session.id);
              }
              setActionStatus('녹화본을 저장하고 세션 처리를 시작했습니다.');
              setExitDialogOpen(false);
              return;
            }
            if (closeIntent.kind === 'finish-saved-session') {
              await port.stopSession(session.id);
              setActionStatus('세션 처리를 시작했습니다.');
              setExitDialogOpen(false);
              return;
            }
            setExitDialogOpen(false);
            void navigate('/mlops/collection');
          } catch (reason) {
            const message = reason instanceof Error ? reason.message : '종료 작업을 완료하지 못했습니다.';
            setExitError(message);
          } finally {
            setPending(false);
          }
        };
        const retakeEpisode = async (): Promise<void> => {
          if (reviewEpisode === null) return;
          const restarted = await run(async () => {
            await port.deleteEpisode(reviewEpisode.id);
            await port.startEpisode(session.id);
          }, '녹화본을 삭제하고 다시 녹화를 시작했습니다.');
          if (restarted) setRetakeDialogOpen(false);
        };
        const collectionIssues = getCollectionIssues({
          actionError: visibleActionError,
          preflight: session.preflight,
          refreshError: telemetryQuery.status === 'error' ? telemetryQuery.message : telemetryQuery.refreshError,
          telemetry,
          effectiveConnectionState: telemetryQuery.effectiveConnectionState,
        });
        const notices = (
          <div className="grid gap-2 empty:hidden">
            {episodesQuery.status === 'error' ? (
              <section aria-label="Episode 조회 오류" className="shrink-0">
                <QueryFeedback kind="error" message="Episode 기록을 불러오지 못했습니다. 다시 시도해 현재 녹화와 저장 상태를 확인하세요." onRetry={episodesQuery.retry} />
              </section>
            ) : null}
            <CollectionIssuesSection
              issues={collectionIssues}
              onOpenDetails={() => { setDetailsTab('issues'); setDetailsOpen(true); }}
            />
          </div>
        );
        return (
          <ColorSchemeArea
            className="flex h-dvh min-h-0 flex-col overflow-hidden"
            layer="base"
            scheme="dark"
          >
            <span aria-live="polite" className="sr-only" role="status">
              {actionStatus}
            </span>
            <header
              className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border px-3 py-2 text-foreground sm:px-4"
              data-collection-header
            >
              <Dialog
                actions={(
                  <>
                    {closeIntent.leaveLabel === null ? null : (
                      <Button
                        disabled={pending}
                        onClick={() => {
                          setExitDialogOpen(false);
                          void navigate('/mlops/collection');
                        }}
                        variant="secondary"
                      >
                        {closeIntent.leaveLabel}
                      </Button>
                    )}
                    <Button
                      isLoading={pending}
                      onClick={() => void performClosePrimary()}
                      variant={closeIntent.kind === 'leave-attention' ? 'secondary' : 'primary'}
                    >
                      {closeIntent.primaryLabel}
                    </Button>
                  </>
                )}
                cancelLabel={closeIntent.cancelLabel}
                description={closeIntent.description}
                onOpenChange={(open) => {
                  setExitDialogOpen(open);
                  if (open) setExitError(null);
                }}
                open={exitDialogOpen}
                title={closeIntent.title}
                trigger={(
                  <Button
                    aria-label="수집 콘솔 닫기"
                    className="size-10 min-h-0 shrink-0 p-0"
                    disabled={pending || episodeData === null}
                    title="닫기"
                    variant="ghost"
                  >
                    <Icon name="close" size="md" />
                  </Button>
                )}
              >
                {exitError === null ? null : (
                  <div className="rounded-[var(--design-radius-control)] bg-status-negative-background px-3 py-2 text-sm text-status-negative-foreground" role="alert">
                    <p>{exitError}</p>
                    <p className="mt-1 text-xs">상태는 그대로 보존되었습니다. 다시 시도할 수 있습니다.</p>
                  </div>
                )}
              </Dialog>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className="min-w-0 truncate text-base font-bold sm:text-lg" title={session.name}>{session.name}</h1>
                  <span className="text-xs text-muted">{getExecutionEnvironmentLabel(session.provenance.environment)}</span>
                </div>
              </div>
              <Button aria-controls="collection-details" aria-expanded={detailsOpen} className="shrink-0" onClick={() => setDetailsOpen((open) => !open)} variant="secondary">수집 상세<Icon name="chevron-down" /></Button>
              <Dropdown
                items={[{ label: '세션 삭제', onSelect: () => setDeleteDialogOpen(true) }]}
                label="세션 메뉴"
                trigger={<Button aria-label="세션 메뉴" className="size-10 min-h-0 p-0" variant="ghost"><Icon name="more" /></Button>}
              />
              <DeleteOperationalSessionButton
                onDeleted={() => void navigate('/mlops/collection')}
                onOpenChange={setDeleteDialogOpen}
                open={deleteDialogOpen}
                session={session}
              />
            </header>
            <CollectionWorkspaceLiveStatus
              effectiveConnectionState={telemetryQuery.effectiveConnectionState}
              session={session}
              state={workspaceState}
            />
            <div
              className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 sm:p-4"
              data-capture-viewport
            >
              {!detailsOpen ? notices : null}
              <div className="collection-workspace" data-inspector-open={detailsOpen}>
              <div
                className="collection-preview"
                data-preview-workspace
              >
                <div className={reviewEpisode === null
                  ? 'h-full min-h-0'
                  : 'collection-review-layout grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2'}>
                  <SessionCollectionPreview
                    ariaLabel={recordedPreview ? 'Episode 기록 미리보기' : '실시간 수집 모니터'}
                    cameraSources={cameraSources}
                    cameraTitle={recordedPreview ? '기록된 Episode 카메라' : '실시간 수집 카메라'}
                    humanDemonstration={session.humanDemonstration !== null}
                    playbackPlaying={reviewPlaying}
                    playbackPositionMs={reviewPositionMs}
                    replayEpisodeId={reviewEpisode?.id ?? null}
                    telemetry={telemetry}
                  />

                  {reviewEpisode === null ? null : (
                    <PlaybackBar
                      ariaLabel="Episode 재생 컨트롤"
                      disabled={pending}
                      durationMs={(reviewEpisode.endedAtMs ?? reviewEpisode.startedAtMs) - reviewEpisode.startedAtMs}
                      formatTime={formatDuration}
                      key={reviewEpisode.id}
                      label={reviewEpisode.name}
                      onPlayingChange={setReviewPlaying}
                      onPositionChange={setReviewPositionMs}
                      playing={reviewPlaying}
                      positionMs={reviewPositionMs}
                      positionAriaLabel="Episode 재생 위치"
                      statusLabel={null}
                    />
                  )}
                </div>
              </div>

              <aside
                aria-label="수집 상세"
                className="collection-inspector"
                hidden={!detailsOpen}
                id="collection-details"
                tabIndex={-1}
              >
                <div className="grid gap-2" data-collection-summary>
                  <section aria-label="작업 지시" className="min-w-0">
                    <h2 className="text-sm text-muted">작업 지시</h2>
                    <p className="mt-2 break-words text-base font-semibold leading-relaxed">{session.instruction}</p>
                  </section>
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2" data-episode-summary>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-xs text-muted">{recordedPreview ? '녹화본' : activeEpisode === null ? '다음 기록' : '현재 기록'}</span>
                      <h2 className="min-w-0 break-words text-base font-semibold">{episodeData === null ? 'Episode 확인 중' : activeEpisode?.name ?? '새 Episode'}</h2>
                    </div>
                    <span className="text-xs tabular-nums text-muted">저장한 Episode {episodeData === null ? '확인 중' : `${String(savedEpisodes.length)}개`}</span>
                  </div>
                  {detailsOpen && detailsTab !== 'issues' ? notices : null}
                </div>
                <Tabs density="compact" value={detailsTab} onValueChange={setDetailsTab} items={[
                  { value: 'session', label: '세션 정보', content: (
                  <section aria-label="세션 정보">
                    <h2 className="sr-only">세션 정보</h2>
                  {session.humanDemonstration === null || !session.humanDemonstration.sourceBindings.some((source) => source.role === 'xr-hand-tracking' && (source.state === 'pending' || source.state === 'offline' || source.state === 'stale')) ? null : (
                    <section aria-label="Quest 연결" className="collection-pairing">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-xs font-semibold text-muted">Quest 연결 코드</h2>
                        <output aria-label="Quest pairing code" className="font-mono text-base font-semibold tabular-nums">{session.humanDemonstration.pairing.code}</output>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted">Quest 브라우저의 수집 페이지에서 입력하세요.</p>
                    </section>
                  )}
                    <dl className="collection-session-fields text-xs">
                      <div><dt>세션 ID</dt><dd className="font-mono">{session.id}</dd></div>
                      <div><dt>작업</dt><dd className="font-mono">{session.taskId}</dd></div>
                      <div><dt>{session.humanDemonstration === null ? '로봇' : '참여자'}</dt><dd className="font-mono">{session.humanDemonstration?.participantId ?? session.robotId}</dd></div>
                      <div><dt>{session.humanDemonstration === null ? '센서' : '외골격 장치'}</dt><dd className="font-mono">{session.humanDemonstration?.exoskeletonDeviceId ?? session.sensorPresetId}</dd></div>
                    </dl>
                    <dl className="collection-recording-fields grid grid-cols-2 gap-3 border-t border-border py-3 text-sm">
                      <div>
                        <dt className="text-muted">원본 기록</dt>
                        <dd className="mt-1">
                          <span className="block font-semibold">{recordingSummary.label}</span>
                          <span className="mt-1 block text-xs text-muted">{recordingSummary.detail}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">데이터 품질</dt>
                        <dd className="mt-1">
                          <span className="block font-semibold">{qualityLabel(telemetry)}</span>
                          <span className="mt-1 block text-xs text-muted">{syncLabel(telemetry)} · {telemetry === null || telemetry.totalSampleCount === 0 ? '데이터 수신 전' : `${telemetry.completenessPercent.toFixed(1)}% 완전성`}</span>
                        </dd>
                      </div>
                    </dl>
                    {session.humanDemonstration === null ? null : (
                      <details className="collection-inline-details">
                        <summary>장치 연결과 명령 응답</summary>
                        <SourceBindingsSection binding={session.humanDemonstration} />
                      </details>
                    )}
                  </section>
                  ) },
                  { value: 'sources', label: '수집 소스', content: <CollectionStreamsSection telemetry={telemetry} /> },
                  { value: 'sync', label: '동기화', content: <MultimodalTimeline telemetry={telemetry} /> },
                  { value: 'issues', label: collectionIssues.count === 0 ? '문제와 조치' : `문제와 조치 · ${String(collectionIssues.count)}`, content: (
                    <CollectionIssuesSection
                      issues={collectionIssues}
                      onOpenDetails={() => setDetailsTab('session')}
                      expanded
                    />
                  ) },
                ]} />
              </aside>
              </div>
            </div>
                  <StickyActionBar
                    aria-label="수집 작업 컨트롤"
                    className="@container static grid shrink-0 gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:flex-wrap sm:items-center sm:justify-between"
                    data-collection-state={workspaceState}
                    position="contained"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <StatusIndicator label={episodeData === null ? 'Episode 상태 확인 필요' : getWorkspaceStateLabel(workspaceState)} pulse={workspaceState === 'recording'} tone={episodeData === null ? 'warning' : workspaceState === 'recording' ? 'negative' : workspaceTone(workspaceState)} />
                        {activeEpisode?.status === 'recording' ? <span aria-label="녹화 경과 시간" className="text-2xl font-semibold tabular-nums"><RecordingElapsedTime episode={activeEpisode} /></span> : null}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-3 max-sm:[&>button]:flex-1" data-cycle-control-anchor>
                      {reviewEpisode !== null ? (
                        <Dialog
                          actions={(
                            <Button
                              isLoading={pending}
                              onClick={() => void retakeEpisode()}
                              variant="danger"
                            >
                              삭제하고 다시 녹화
                            </Button>
                          )}
                          cancelLabel="녹화본 계속 확인"
                          description="현재 녹화본은 복구할 수 없으며, 삭제 후 바로 새 녹화를 시작합니다."
                          onOpenChange={setRetakeDialogOpen}
                          open={retakeDialogOpen}
                          title="이 녹화본을 삭제하고 다시 녹화할까요?"
                          trigger={(
                            <Button disabled={pending} variant="secondary"><Icon name="restart" />다시 녹화</Button>
                          )}
                        />
                      ) : null}
                      {activeEpisode?.status === 'finalizing' && activeEpisode.finalizationError !== null ? (
                        <Button
                          disabled={pending}
                          onClick={() => void run(() => port.invalidateEpisode(activeEpisode.id), 'Episode를 invalid로 보존하고 계속합니다.')}
                          variant="secondary"
                        >
                          Episode 제외
                        </Button>
                      ) : null}
                      {canRunPreflight ? (
                        <Button
                          disabled={preflightSourceBlocked || episodeData === null}
                          isLoading={pending}
                          onClick={() => void run(
                            () => port.validateSession(session.id),
                            '사전점검을 통과했습니다. 이제 Episode를 시작할 수 있습니다.',
                          )}
                        >
                          {preflightSourceBlocked ? 'Collector 준비 필요' : '사전점검 실행'}
                        </Button>
                      ) : null}
                      {!canRunPreflight
                        && session.activeEpisodeId === null
                        && (session.status === 'active' || session.status === 'ready')
                        && !requiredSourcesOperational ? (
                          <Button disabled>필수 Collector 확인</Button>
                        ) : null}
                      {canStartEpisode ? (
                        <Button
                          aria-label={savedEpisodes.length === 0
                            ? 'Episode 녹화 시작'
                            : '다음 Episode 녹화 시작'}
                          isLoading={pending}
                          onClick={() => void run(
                            async () => {
                              if (session.status !== 'active') {
                                await port.startSession(session.id);
                              }
                              await port.startEpisode(session.id);
                            },
                            savedEpisodes.length === 0
                              ? 'Episode 기록을 시작했습니다.'
                              : '다음 Episode 기록을 시작했습니다.',
                          )}
                        >
                          <Icon filled name="record" />
                          {savedEpisodes.length === 0 ? 'Episode 녹화 시작' : '다음 Episode 녹화 시작'}
                        </Button>
                      ) : null}
                      {activeEpisode?.status === 'recording' ? (
                        <Button
                          aria-label="Episode 녹화 정지"
                          isLoading={pending}
                          onClick={() => void run(
                            () => port.stopEpisode(activeEpisode.id),
                            '녹화를 정지했습니다. 녹화본을 확인하세요.',
                          )}
                          title="Episode 녹화 정지"
                          variant="recording-stop"
                        >
                          <Icon filled name="stop" />
                          녹화 정지
                        </Button>
                      ) : null}
                      {reviewEpisode !== null ? (
                        <Button
                          isLoading={pending}
                          onClick={() => void run(
                            () => port.saveEpisode(reviewEpisode.id),
                            '현재 녹화본을 저장했습니다.',
                          )}
                        >
                          <Icon name="check" />
                          녹화본 저장
                        </Button>
                      ) : null}
                      {activeEpisode?.status === 'finalizing'
                        && activeEpisode.finalizationError !== null ? (
                          <Button isLoading={pending} onClick={() => void run(() => port.retryEpisodeFinalization(activeEpisode.id), 'Episode 저장을 다시 시작했습니다.')}>다시 저장</Button>
                        ) : null}
                      {shouldRetryProcessing ? (
                        <Button isLoading={pending} onClick={() => void run(() => port.retrySessionProcessing(session.id), '세션 처리를 다시 시작했습니다.')}>처리 재시도</Button>
                      ) : null}
                    </div>
                  </StickyActionBar>
          </ColorSchemeArea>
        );
      }}
    </AsyncState>
  );
}

export function LegacyHumanoidSessionRedirectPage() {
  const { sessionId = '' } = useParams();
  const load = useCallback((port: ReturnType<typeof useFlywheelPort>) => port.getSession(sessionId), [sessionId]);
  const query = useFlywheelQuery(load);
  return (
    <AsyncState query={query} emptyMessage="수집 세션을 찾을 수 없습니다.">
      {(session) => (
        <Navigate
          replace
          to={session.status === 'completed' ? `/mlops/catalog/${session.id}` : `/mlops/collection/${session.id}`}
        />
      )}
    </AsyncState>
  );
}

interface WorkspacePageProps {
  readonly defaultView: string;
  readonly items: readonly TabItem[];
}

function WorkspacePage({ defaultView, items }: WorkspacePageProps) {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('view');
  const view = items.some((item) => item.value === requestedView)
    ? requestedView ?? defaultView
    : defaultView;

  return (
    <Tabs
      items={items}
      onValueChange={(nextView) => {
        const next = new URLSearchParams(params);
        if (nextView === defaultView) next.delete('view');
        else next.set('view', nextView);
        setParams(next, { replace: true });
      }}
      value={view}
    />
  );
}

export function ReviewWorkspacePage() {
  return (
    <WorkspacePage
      defaultView="annotations"
      items={[
        { value: 'annotations', label: '검수 작업', content: <AnnotationsPage /> },
        { value: 'quality', label: '품질 검사', content: <QualityPage /> },
      ]}
    />
  );
}

export function OperationsWorkspacePage() {
  return (
    <WorkspacePage
      defaultView="deployments"
      items={[
        { value: 'deployments', label: '배포', content: <DeploymentsPage /> },
        { value: 'inference', label: '추론 세션', content: <InferencePage /> },
      ]}
    />
  );
}
