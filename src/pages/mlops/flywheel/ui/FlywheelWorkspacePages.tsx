import { Brand } from '@/shared/ui/brand';
import { CollectionCameraPanel } from './CollectionCameraPanel';
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
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import {
  CollectionPerceptionViewer,
  SessionConflictError,
  HumanoidRigViewer,
  isEpisodeTransferComplete,
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
import { formatBytes, formatRelativeTime } from '@/shared/lib/format';
import { downloadTextFile } from '@/shared/lib/record-export';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Dialog } from '@/shared/ui/dialog';
import { Dropdown } from '@/shared/ui/dropdown';
import { Icon } from '@/shared/ui/icon';
import { SearchField } from '@/shared/ui/search-field';
import { PageHeader } from '@/shared/ui/page-header';
import { PlaybackBar } from '@/shared/ui/playback-bar';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Select } from '@/shared/ui/select';
import { StatusIndicator, type StatusIndicatorTone } from '@/shared/ui/status-indicator';
import { StickyActionBar } from '@/shared/ui/sticky-action-bar';
import { Surface } from '@/shared/ui/surface';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Tabs, RailTabs, RailTabList, RailTab, RailTabPanel, type TabItem } from '@/shared/ui/tabs';
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
} from './flywheel-page-shared';
import { formatDateTime, formatDuration, VIDEO_SOURCE } from './flywheel-page-utils';
import './collection-workspace.css';
import {
  getCloseIntent,
  type CollectionWorkspaceState,
} from './collection-close-intent';
export { NewHumanoidCollectionPage } from './NewCollectionDialog';
import type { CollectionSetupContext } from './NewCollectionDialog';
import { createCollectionSessionExportRecord } from './flywheel-export-records';
import { QuestPairingPanel } from './QuestPairingPanel';
import { BrowserCameraWorkspace } from './BrowserCameraPanel';
import { useAutomaticPreflight } from './use-automatic-preflight';
import { collectionPreviewState, hasHandPreview } from './collection-preview-state';
import { CollectionEmptyState } from './CollectionEmptyState';
import type { MediaStreamState } from '@/shared/ui/media-panel';

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
  if (activeEpisode?.status === 'completed' && activeEpisode.outcome === null) {
    return isEpisodeTransferComplete(activeEpisode) ? 'review' : 'finalizing';
  }
  if ((session.status === 'active' || session.status === 'ready') && activeEpisode === null) return 'episode-ready';
  return 'prepare';
}

function getWorkspaceStateLabel(state: CollectionWorkspaceState, episode: FlywheelEpisode | null = null): string {
  if (state === 'finalizing' && episode !== null && !isEpisodeTransferComplete(episode)) return '원본 전송 중';
  const labels: Readonly<Record<CollectionWorkspaceState, string>> = {
    prepare: '장치 연결 필요',
    'episode-ready': '녹화 준비 완료',
    recording: '녹화 중',
    finalizing: '파일 확정 중',
    review: '검토 중',
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

function CollectionWorkspaceLiveStatus({
  activeEpisode,
  effectiveConnectionState,
  session,
  state,
  preparationLabel,
  awaitingConnection,
}: {
  readonly activeEpisode: FlywheelEpisode | null;
  readonly effectiveConnectionState: CollectionTelemetryConnectionState;
  readonly session: HumanoidCaptureSession;
  readonly state: CollectionWorkspaceState;
  readonly preparationLabel: string;
  readonly awaitingConnection: boolean;
}) {
  const label = state === 'processing'
    ? session.processingStage === 'indexing' ? '인덱스 생성 중' : '파일 확정 중'
    : state === 'prepare' ? preparationLabel : getWorkspaceStateLabel(state, activeEpisode);
  const connection = awaitingConnection ? '필수 장치 연결 전' : effectiveConnectionState === 'live'
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
  activeEpisode: FlywheelEpisode | null,
) {
  if (state === 'recording') {
    return { label: '수신 중 · 저장 미확인', detail: `${formatBytes(telemetry?.bytesWritten ?? session.bytesWritten)} 수신`, tone: 'warning' as const };
  }
  if (state === 'finalizing') {
    return activeEpisode !== null && !isEpisodeTransferComplete(activeEpisode)
      ? { label: '원본 전송 중', detail: '필수 장치의 전송 완료를 기다리고 있습니다. 수집 장치의 연결을 유지하세요.', tone: 'warning' as const }
      : { label: '파일 확정 중', detail: '창을 닫지 마세요', tone: 'warning' as const };
  }
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

function CollectionStreamTimeline({ stream, telemetry }: {
  readonly stream: CollectionStreamTelemetry;
  readonly telemetry: CollectionTelemetrySnapshot | null;
}) {
  const track = telemetry?.timeline.tracks.find((item) => item.streamId === stream.streamId);
  if (track === undefined || telemetry === null || stream.origin === 'derived') return null;
  const windowMs = telemetry.timeline.windowMs;
  const anomalies = track.anomalies.map((anomaly) => anomaly.label).join(', ');
  return (
    <div
      aria-label={`${stream.displayName} 최근 ${String(windowMs / 1_000)}초 수신 기록${anomalies === '' ? '' : ` · ${anomalies}`}`}
      className={`relative col-span-2 h-1.5 overflow-hidden rounded-[var(--design-radius-round)] ${stream.lastSampleAtMs === null || !stream.required ? 'bg-status-neutral-background' : 'bg-status-positive-background'}`}
      role="img"
    >
      {track.anomalies.map((anomaly, index) => {
        const left = Math.max(0, Math.min(100, (anomaly.startOffsetMs + windowMs) / windowMs * 100));
        const right = Math.max(0, Math.min(100, (anomaly.endOffsetMs + windowMs) / windowMs * 100));
        return (
          <span
            className={`absolute inset-y-0 ${anomaly.severity === 'critical' ? 'bg-negative' : 'bg-warning'}`}
            key={`${anomaly.kind}-${String(index)}`}
            style={{ left: `${String(left)}%`, width: `${String(Math.max(1.5, right - left))}%` }}
            title={anomaly.label}
          />
        );
      })}
    </div>
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
  previewStates,
}: {
  readonly ariaLabel: string;
  readonly cameraSources: readonly SynchronizedPlayerSource[];
  readonly cameraTitle: string;
  readonly playbackPlaying?: boolean;
  readonly playbackPositionMs?: number;
  readonly poseKind?: 'rig' | 'quest-hands';
  readonly handPose?: CollectionHandPoseTelemetry | null;
  readonly telemetry?: CollectionTelemetrySnapshot | null;
  readonly previewStates: Readonly<Record<string, MediaStreamState>>;
}) {
  const robotState = telemetry?.streams.find((stream) => (
    stream.streamId === 'robot-state' || stream.streamId === 'exoskeleton-state'
  )) ?? null;
  const leftState = previewStates['quest-hand-left'] ?? 'idle';
  const rightState = previewStates['quest-hand-right'] ?? 'idle';
  const showHands = hasHandPreview(previewStates);
  const handsOnly = poseKind === 'quest-hands' && cameraSources.length === 0;
  const handState = leftState === 'recorded' ? 'recorded' : leftState === 'live' || rightState === 'live' ? 'live'
    : leftState === 'stale' || rightState === 'stale' ? 'stale' : leftState === 'offline' || rightState === 'offline' ? 'offline' : 'idle';
  return (
    <section
      aria-label={ariaLabel}
      className={handsOnly ? 'grid h-full min-h-0' : poseKind === 'quest-hands' ? 'collection-visual-grid' : 'grid h-full min-h-0 grid-cols-2 gap-2'}
    >
      {handsOnly ? null : <div
        className="collection-cameras min-h-0 min-w-0 overflow-hidden"
        data-primary-visual="camera"
      >
        <SynchronizedPlayer
          layout="featured"
          presentation="monitoring"
          sources={cameraSources}
          title={cameraTitle}
        />
      </div>}

      {poseKind === 'quest-hands' && !handsOnly ? (
        <div className="collection-perception min-h-0 min-w-0 overflow-hidden">
          <CollectionPerceptionViewer result={telemetry?.headPerception ?? null} streamState={previewStates['rbp-head-rgb'] ?? 'idle'} />
        </div>
      ) : null}
      {poseKind === 'quest-hands' && !showHands ? null : <div
        className="collection-hands min-h-0 min-w-0 overflow-hidden"
        data-primary-visual="pose"
      >
        {poseKind === 'quest-hands' ? (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted" role="status">손 포즈 뷰 준비 중</div>}>
            <QuestHandPoseViewer
              handPose={handPose === undefined ? telemetry?.handPose ?? null : handPose}
              streams={telemetry?.streams ?? []}
              streamState={handState}
              availability={{ left: leftState, right: rightState }}
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
      </div>}
      {poseKind === 'quest-hands' && !handsOnly ? (
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
  previewStates,
}: {
  readonly ariaLabel: string;
  readonly cameraSources: readonly SynchronizedPlayerSource[];
  readonly cameraTitle: string;
  readonly humanDemonstration: boolean;
  readonly playbackPlaying: boolean;
  readonly playbackPositionMs: number;
  readonly replayEpisodeId: string | null;
  readonly telemetry: CollectionTelemetrySnapshot | null;
  readonly previewStates: Readonly<Record<string, MediaStreamState>>;
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
      previewStates={previewStates}
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
  if (stream.connectionState === 'offline') return '연결 끊김';
  if (stream.connectionState === 'stale') return '수신 지연';
  if (stream.handTracking !== null && stream.handTracking !== undefined) {
    if (stream.handTracking.qualityState === 'tracking') return '추적 정상';
    if (stream.handTracking.qualityState === 'partial') return '부분 관측';
    return '추적 유실';
  }
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
  if (stream.connectionState === 'offline') return stream.required ? 'negative' : 'neutral';
  if (stream.connectionState === 'stale') return 'warning';
  if (stream.handTracking !== null && stream.handTracking !== undefined) {
    if (stream.handTracking.qualityState === 'tracking') return 'positive';
    if (stream.handTracking.qualityState === 'partial') return 'warning';
    return 'negative';
  }
  if (stream.health === 'healthy') return 'positive';
  if (stream.health === 'degraded') return 'warning';
  return 'negative';
}

function rateLabel(stream: CollectionStreamTelemetry): string {
  const unit = stream.modality === 'rgb'
    || stream.modality === 'depth'
    || stream.modality === 'semantic'
    || stream.modality === 'estimated-depth'
    ? 'FPS'
    : 'Hz';
  const observed = stream.observedRateHz === null ? '—' : stream.observedRateHz.toFixed(1);
  if (stream.expectedRateHz === null) {
    return stream.observedRateHz === null ? '—' : `${observed} ${unit}`;
  }
  const expected = stream.expectedRateHz.toFixed(0);
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
  conflictingSessionId = null,
  preflight,
  refreshError,
  telemetry,
  effectiveConnectionState,
  monitoring = true,
  awaitingStreamIds = [],
}: {
  readonly actionError: string | null;
  readonly conflictingSessionId?: string | null;
  readonly preflight: readonly FlywheelPreflightCheck[];
  readonly refreshError: string | null;
  readonly telemetry: CollectionTelemetrySnapshot | null;
  readonly effectiveConnectionState: CollectionTelemetryConnectionState;
  readonly monitoring?: boolean;
  readonly awaitingStreamIds?: readonly string[];
}) {
  const requiredStreams = telemetry?.streams.filter((stream) => stream.required && stream.origin !== 'derived'
    && !awaitingStreamIds.includes(stream.streamId)) ?? [];
  const affectedStreams = monitoring ? requiredStreams.filter((stream) => streamHealthTone(stream) !== 'positive') : [];
  // A single unavailable source must not turn into a device-wide outage.
  const connectionProblem = refreshError !== null || (monitoring && telemetry !== null && requiredStreams.length > 0
    && (awaitingStreamIds.length === 0 || affectedStreams.length > 0)
    && effectiveConnectionState !== 'live'
    && (telemetry.connectionState !== 'live' || affectedStreams.length === 0
      || affectedStreams.length === requiredStreams.length));
  const qualityIssues = (telemetry?.qualityIssues ?? []).filter((issue) => {
    if (monitoring && issue.streamId != null && awaitingStreamIds.includes(issue.streamId)
      && (issue.id.startsWith('disconnected-') || issue.id.startsWith('degraded-') || issue.id === 'no-hand-pose-data')) return false;
    // Only live reception symptoms are covered by the connection warning.
    // Stored-data, calibration, sync and processing issues remain actionable.
    return !(connectionProblem && monitoring
      && (issue.id.startsWith('disconnected-') || issue.id.startsWith('degraded-'))
      && requiredStreams.some((stream) => stream.streamId === issue.streamId));
  });
  const criticalIssues = qualityIssues.filter((issue) => issue.severity === 'critical');
  const warnings = qualityIssues.filter((issue) => issue.severity !== 'critical');
  const failedChecks = monitoring ? preflight.filter((check) => {
    if (check.state !== 'failed') return false;
    if (awaitingStreamIds.length > 0 && affectedStreams.length === 0 && ['streams', 'sources', 'quest-hands'].includes(check.id)) return false;
    if (['streams', 'sources'].includes(check.id)) return !connectionProblem && affectedStreams.length === 0;
    if (check.id === 'robot') return !connectionProblem;
    if (check.id === 'quest-hands') return !connectionProblem
      && !affectedStreams.some((stream) => stream.modality === 'hand-pose');
    return true;
  }) : [];
  const unhealthySources = connectionProblem ? [] : affectedStreams.filter((stream) => (
    !qualityIssues.some((issue) => issue.streamId === stream.streamId
      && (issue.severity === 'critical' || issue.id === `degraded-${stream.streamId}`
        || issue.id === `disconnected-${stream.streamId}`))
  ));
  const operationalCount = Number(actionError !== null) + Number(connectionProblem)
    + failedChecks.length + criticalIssues.length + unhealthySources.length;
  return {
    actionError, conflictingSessionId, refreshError, effectiveConnectionState, failedChecks, criticalIssues,
    warnings, unhealthySources, connectionProblem,
    count: operationalCount + warnings.length,
  };
}

function CollectionIssuesSection({ issues, onCheckConnections, onRetry }: {
  readonly issues: ReturnType<typeof getCollectionIssues>;
  readonly onCheckConnections: () => void;
  readonly onRetry: () => void;
}) {
  const {
    actionError, conflictingSessionId, refreshError, effectiveConnectionState, failedChecks, criticalIssues,
    warnings, unhealthySources, connectionProblem, count,
  } = issues;
  if (count === 0) {
    return <p className="text-sm text-muted">현재 확인할 문제가 없습니다.</p>;
  }

  return (
    <section aria-label="현재 문제와 조치" className="grid shrink-0 gap-2" data-operational-issues>
      {actionError === null ? null : (
        <div className="rounded-[var(--design-radius-control)] bg-status-negative-background px-3 py-2 text-sm text-status-negative-foreground" role="alert">
          <span>{actionError}</span>
          {conflictingSessionId === null ? null : (
            <Link className="ml-1 underline" to={`/mlops/collection/${encodeURIComponent(conflictingSessionId)}`}>사용 중인 세션 열기</Link>
          )}
          <p className="mt-1 text-xs">원인을 해결한 뒤 다시 시도하세요.</p>
        </div>
      )}
      {connectionProblem ? (
        <div className="grid gap-3 rounded-[var(--design-radius-control)] bg-status-warning-background px-3 py-2 text-sm text-status-warning-foreground">
          <p role="status">{refreshError !== null ? '수집 상태를 불러오지 못했습니다.' : effectiveConnectionState === 'offline' ? '수집 장치 연결 끊김' : '수집 상태 갱신 지연'}
            {refreshError === null ? null : <span className="block text-xs">{refreshError}</span>}
          </p>
          <Button variant="secondary" onClick={refreshError === null ? onCheckConnections : onRetry}>
            {refreshError === null ? '장치 연결 확인' : '상태 다시 불러오기'}
          </Button>
        </div>
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

function CollectionSensorSection({ label, title, connection, children }: {
  readonly label: string;
  readonly title: string;
  readonly connection?: ReactNode;
  readonly children?: ReactNode;
}) {
  return <section aria-label={label} className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold">{title}</h3>
      {connection}
    </div>
    {children}
  </section>;
}

function CollectionStreamsSection({ telemetry, questConnection, cameraConnection, cameraDevices, questSetupState, connectionState = 'live' }: {
  readonly telemetry: CollectionTelemetrySnapshot | null;
  readonly questConnection?: ReactNode;
  readonly connectionState?: CollectionTelemetryConnectionState;
  readonly cameraConnection?: ReactNode;
  readonly cameraDevices?: ReactNode;
  readonly questSetupState?: 'pending' | 'paired' | undefined;
}) {
  const streams = telemetry?.streams ?? [];
  const required = streams.filter((stream) => stream.required && stream.origin !== 'derived');
  const optional = streams.filter((stream) => !stream.required && stream.origin !== 'derived');
  const derived = streams.filter((stream) => stream.origin === 'derived');
  const questStreams = required.filter((stream) => stream.streamId === 'quest-hand-left' || stream.streamId === 'quest-hand-right');

  const awaitingConnection = (stream: CollectionStreamTelemetry) => connectionState !== 'live'
    && stream.origin !== 'derived' && stream.required;
  const renderStream = (stream: CollectionStreamTelemetry) => (
    <article aria-label={`${stream.displayName} 상태`} className="collection-stream min-w-0 rounded-[var(--design-radius-control)] bg-layer-base p-4" key={stream.streamId}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 break-words text-sm font-semibold leading-relaxed text-foreground">{stream.displayName}</h4>
        <span className={`text-right text-sm font-medium ${awaitingConnection(stream) ? 'text-muted' : streamHealthTone(stream) === 'positive' ? 'text-positive' : streamHealthTone(stream) === 'warning' ? 'text-warning' : streamHealthTone(stream) === 'negative' ? 'text-negative' : 'text-muted'}`}>
          {awaitingConnection(stream) ? '연결 대기' : streamHealthLabel(stream)}
        </span>
      </header>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-muted">
          <span className="mt-1 block break-words text-sm leading-relaxed tabular-nums text-warning empty:hidden">
            {stream.droppedFrameCount + stream.missingSampleCount === 0
              ? ''
              : `프레임 손실 ${String(stream.droppedFrameCount)} · 샘플 누락 ${String(stream.missingSampleCount)}`}
          </span>
          <span className="mt-1 block break-words text-sm leading-relaxed tabular-nums text-warning empty:hidden">
            {stream.handTracking == null || (stream.handTracking.validJointCount === 25 && stream.handTracking.consecutiveMissingMs === 0)
              ? ''
              : `유효 관절 ${String(stream.handTracking.validJointCount)}/25 · 연속 누락 ${String(stream.handTracking.consecutiveMissingMs)} ms`}
          </span>
          {stream.lastSampleAtMs === null || stream.driftMs === null || telemetry === null || Math.abs(stream.driftMs) <= telemetry.sync.toleranceMs ? null : (
            <span className="mt-1 block text-sm tabular-nums text-warning">시간 차이 {stream.driftMs.toFixed(1)} ms · 허용 범위 초과</span>
          )}
          {stream.origin === 'derived' || stream.modality === 'hand-pose' ? null : <span className="block text-sm tabular-nums text-foreground">{rateLabel(stream)}</span>}
          <p>{stream.lastSampleAtMs === null ? '수신 기록 없음' : `${formatRelativeTime(stream.lastSampleAtMs)} 수신`}</p>
          {stream.origin === 'derived' ? null : <p className={`text-sm tabular-nums ${stream.lastSampleAtMs !== null && stream.driftMs !== null && telemetry !== null && Math.abs(stream.driftMs) > telemetry.sync.toleranceMs ? 'text-warning' : 'text-muted'}`}>
          {stream.lastSampleAtMs === null || stream.driftMs === null ? '시간 차이 확인 전' : `시간 차이 ${stream.driftMs.toFixed(1)} ms`}
          </p>}
          <CollectionStreamTimeline stream={stream} telemetry={telemetry} />
          {stream.sourceDeviceId == null ? null : <p className="wrap-anywhere text-xs">장치 <span className="font-mono">{stream.sourceDeviceId}</span></p>}
        </div>
    </article>
  );

  return (
    <section aria-label="장치 스트림 상태" className="py-4">
      {telemetry === null || telemetry.sync.state === 'unavailable' ? null : <div className="mb-6 text-sm" aria-label="동기화 요약">
        <p className="font-semibold">{syncLabel(telemetry)}</p>
        <p className="mt-1 leading-relaxed tabular-nums text-muted">{telemetry.sync.maxDriftMs === null ? '시간 차이 확인 전' : `최대 시간 차이 ${telemetry.sync.maxDriftMs.toFixed(1)} ms`} · 허용 {telemetry.sync.toleranceMs} ms</p>
      </div>}
      <h2 className="mb-4 text-base font-semibold">장치</h2>
      <div className="collection-stream-list grid gap-4">
        {questStreams.length === 0 && questConnection == null && questSetupState !== 'paired' ? null : (
          <CollectionSensorSection label="Quest 손 추적 장치" title="Quest" connection={questConnection}>
            {questSetupState === 'paired' ? <p role="status" className="text-sm text-muted">연결됨 · Quest에서 손 추적 시작 대기</p> : questSetupState === 'pending' ? null : questStreams.map((stream) => renderStream(stream))}
          </CollectionSensorSection>
        )}
        {cameraConnection == null && cameraDevices == null ? null : <CollectionSensorSection label="카메라 장치" title="카메라" connection={cameraConnection}>{cameraDevices}</CollectionSensorSection>}
        {required.filter((stream) => !questStreams.includes(stream)).map((stream) => renderStream(stream))}
        {telemetry !== null ? null : <p className="py-3 text-xs text-muted">장치의 수신 상태를 기다리고 있습니다.</p>}
        {telemetry === null || required.length > 0 ? null : <p className="py-3 text-xs text-muted">필수 수집 소스가 없습니다. 세션의 장치 구성을 확인하세요.</p>}
      </div>
      {[
        { label: '선택 소스', streams: optional },
        { label: '파생 데이터', streams: derived },
      ].filter((group) => group.streams.length > 0).map((group) => (
        <section aria-label={group.label} className="mt-6" key={group.label}>
          <header className="mb-3 flex items-center gap-2"><h3 className="text-base font-semibold">{group.label}</h3><span className="text-sm tabular-nums text-muted">{group.streams.length}</span>
            {group.streams.some((stream) => ['warning', 'negative'].includes(streamHealthTone(stream))) ? <span className="ml-auto text-xs font-normal text-warning">확인 필요</span> : null}
          </header>
          <div className="collection-stream-list grid gap-4">{group.streams.map((stream) => renderStream(stream))}</div>
        </section>
      ))}
    </section>
  );
}

function CollectorCommandStatus({ binding }: { readonly binding: HumanDemonstrationBinding }) {
  if (binding.collectorAcknowledgements.length === 0) return null;
  const acknowledgements = binding.collectorAcknowledgements.slice(-6);
  const pendingCount = acknowledgements.filter((acknowledgement) => acknowledgement.state !== 'acknowledged').length;
  return (
      <section className="pt-2">
        <h3 className="text-base font-semibold">녹화 명령 응답{pendingCount === 0 ? null : <span className="ml-auto text-xs font-normal text-warning">미확인 {pendingCount}건</span>}</h3>
        <section aria-label="Collector 명령 응답" className="pb-2">
          <ul className="mt-3 grid gap-3 text-sm leading-relaxed text-muted">
            {acknowledgements.map((acknowledgement) => (
              <li className="wrap-anywhere" key={`${acknowledgement.episodeId}-${acknowledgement.sourceDeviceId}-${acknowledgement.command}`}>
                {acknowledgement.sourceDeviceId} · {acknowledgement.command === 'start' ? '시작' : '정지'} · {acknowledgement.state === 'acknowledged' ? '확인 완료' : acknowledgement.state === 'rejected' ? '거절됨' : '응답 대기'}
              </li>
            ))}
          </ul>
        </section>
      </section>
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
      cancelDisabled={pending}
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
  const createLinkRef = useRef<HTMLAnchorElement>(null);
  const query = useFlywheelQuery(loadCollectionOperations);
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const stateFilter = params.get('state') ?? 'all';
  const profileFilter = params.get('profile') ?? 'all';
  const siteFilter = params.get('collectionSite') ?? 'all';
  const sort = params.get('sort') ?? 'priority';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const advancedFilterCount = Number(profileFilter !== 'all') + Number(siteFilter !== 'all') + Number(sort !== 'priority');
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
  const hasFilters = search.length > 0 || stateFilter !== 'all' || advancedFilterCount > 0;
  const resetFilters = (): void => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const key of ['q', 'state', 'profile', 'collectionSite', 'sort']) next.delete(key);
      return next;
    }, { replace: true });
  };

  return (
    <div className="@container grid min-w-0 gap-6">
      <PageHeader
        title="데이터 수집"
        actions={isEmpty ? undefined : unavailable
          ? <Button disabled title="수집 장치 연결을 먼저 설정해야 합니다.">새 수집</Button>
          : <Link ref={createLinkRef} className={getButtonClassName('primary')} to={{ pathname: '/mlops/collection/new', search: params.toString() }}>새 수집</Link>}
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
            <Link ref={createLinkRef} className={getButtonClassName('primary')} to={{ pathname: '/mlops/collection/new', search: params.toString() }}>새 수집</Link>
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
            const workspaceState = getCollectionWorkspaceState(session, activeEpisode);
            const needsConnection = session.humanDemonstration !== null
              && required.tone !== 'positive'
              && (workspaceState === 'prepare' || workspaceState === 'episode-ready' || workspaceState === 'recording');
            const state = needsConnection && workspaceState === 'episode-ready' ? 'prepare' : workspaceState;
            return {
              session,
              activeEpisode,
              needsAttention: quality.needsReview
                || state === 'attention'
                || needsConnection,
              needsConnection,
              quality,
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
          const stateOptions = [
            { label: '전체', count: counts.all, value: 'all' },
            { label: '확인 필요', count: counts.attention, value: 'attention' },
            { label: '녹화 중', count: counts.recording, value: 'recording' },
            ...(counts.review > 0 || stateFilter === 'review' ? [{ label: '검토 대기', count: counts.review, value: 'review' }] : []),
            ...(counts.processing > 0 || stateFilter === 'processing' ? [{ label: '처리 중', count: counts.processing, value: 'processing' }] : []),
            ...(stateFilter === 'prepare' || stateFilter === 'episode-ready' ? [{
              label: stateFilter === 'prepare' ? '준비 중' : '녹화 준비',
              count: rows.filter((row) => row.state === stateFilter).length,
              value: stateFilter,
            }] : []),
          ];
          const listContent = (
            <>
              <p className="sr-only" role="status">전체 {rows.length}개 중 {sorted.length}개 표시</p>
              {exportStatus ? <p className={`text-sm ${exportError ? 'text-negative' : 'text-muted'}`} role={exportError ? 'alert' : 'status'}>{exportStatus}</p> : null}
              {sorted.length === 0 ? (
                <QueryFeedback kind="filtered-empty" message={search.trim() ? `‘${search.trim()}’ 검색 결과가 없습니다. 검색·필터를 초기화해 전체 세션을 확인하세요.` : '선택한 조건의 세션이 없습니다. 검색·필터를 초기화해 전체 세션을 확인하세요.'} />
              ) : (
                <Table aria-label="운영 중인 휴머노이드 수집 세션" className="block w-full text-start text-sm @min-[46rem]:table @min-[46rem]:table-fixed">
                  <TableHeader className="sr-only text-muted @min-[46rem]:not-sr-only @min-[46rem]:table-header-group">
                    <TableRow>
                      <TableHead className="w-[36%] px-4 py-2 text-start font-medium">세션·작업</TableHead>
                      <TableHead className="w-[25%] px-4 py-2 text-start font-medium">상태</TableHead>
                      <TableHead className="w-[15%] px-4 py-2 text-start font-medium">최근 갱신</TableHead>
                      <TableHead className="px-4 py-2 text-end font-medium"><span className="sr-only">세션 메뉴</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="block divide-y divide-border @min-[46rem]:table-row-group">
                    {sorted.map(({ activeEpisode, needsAttention, needsConnection, quality, session, state }) => {
                      const sessionPath = `/mlops/collection/${encodeURIComponent(session.id)}`;
                      const destination = { pathname: sessionPath, search: params.toString() };
                      const statusLabel = needsConnection && state !== 'recording' ? '장치 연결 필요'
                        : quality.needsReview && state === 'episode-ready' ? quality.label
                          : getWorkspaceStateLabel(state, activeEpisode);
                      const statusTone = needsAttention && state !== 'recording' ? 'warning' : workspaceTone(state);
                      return (
                        <TableRow className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 p-4 @min-[46rem]:table-row" key={session.id}>
                          <TableCell className="col-span-2 block min-w-0 @min-[46rem]:table-cell @min-[46rem]:px-4 @min-[46rem]:py-3">
                            <Link className="block truncate font-semibold hover:underline" title={session.name} to={destination} viewTransition>{session.name}</Link>
                            <p className="mt-1 truncate text-xs text-muted" title={session.instruction}>{session.instruction}</p>
                          </TableCell>
                          <TableCell className="block min-w-0 @min-[46rem]:table-cell @min-[46rem]:px-4 @min-[46rem]:py-3">
                            <StatusIndicator label={statusLabel} tone={statusTone} />
                            {state === 'recording' && needsConnection ? <p className="mt-1 text-xs text-warning">장치 연결 확인 필요</p> : null}
                          </TableCell>
                          <TableCell className="block min-w-0 text-end text-xs text-muted @min-[46rem]:table-cell @min-[46rem]:px-4 @min-[46rem]:py-3 @min-[46rem]:text-start">
                            <time dateTime={new Date(session.updatedAtMs).toISOString()} title={formatDateTime(session.updatedAtMs)}>{formatRelativeTime(session.updatedAtMs, now)}</time>
                          </TableCell>
                          <TableCell className="col-span-2 block min-w-0 @min-[46rem]:table-cell @min-[46rem]:px-4 @min-[46rem]:py-3">
                            <div className="flex items-center justify-end gap-1">
                              <OperationalSessionActions session={session} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          );
          return (
            <section aria-labelledby="collection-list-title" className="grid min-w-0 gap-3">
              <h2 className="sr-only" id="collection-list-title">수집 세션</h2>
              <div className="flex min-w-0 items-center gap-2">
                <SearchField
                  className="min-w-0 flex-1"
                  label="수집 검색"
                  showLabel={false}
                  onValueChange={(value) => setFilter('q', value)}
                  placeholder="세션 또는 작업 검색"
                  value={search}
                />
                <Button aria-controls="collection-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} variant="secondary">
                  필터{advancedFilterCount > 0 ? ` · ${String(advancedFilterCount)}` : ''}
                </Button>
                <Dropdown label="수집 목록 메뉴" trigger={<Button className="size-10 min-h-0 shrink-0 p-0" variant="ghost"><Icon name="more" /></Button>} items={[{
                  label: '수집 세션 JSON 내보내기',
                  disabled: sorted.length === 0,
                  icon: <Icon name="download" />,
                  onSelect: () => {
                    try {
                      downloadTextFile('collection-sessions.json', JSON.stringify(sorted.map(({ session }) => createCollectionSessionExportRecord(session)), null, 2), 'application/json');
                      setExportStatus(`현재 표시된 세션 ${String(sorted.length)}개의 기록 정보를 내보냈습니다.`);
                      setExportError(false);
                    } catch {
                      setExportStatus('기록 정보를 내보내지 못했습니다. 다시 시도하세요.');
                      setExportError(true);
                    }
                  },
                }]} />
              </div>
              <div hidden={!filtersOpen} id="collection-filters">
                <div className="grid gap-3 pb-4 sm:grid-cols-3">
                  <Select label="장치 프로필" className="min-w-0" value={profileFilter} onValueChange={(value) => setFilter('profile', value)} options={[
                    { label: '전체 프로필', value: 'all' },
                    ...profileOptions.map((profile) => ({ label: profile, value: profile })),
                  ]} />
                  <Select label="수집 장소" className="min-w-0" value={siteFilter} onValueChange={(value) => setFilter('collectionSite', value)} options={[
                    { label: '전체 장소', value: 'all' },
                    ...siteOptions.map((site) => ({ label: site, value: site })),
                  ]} />
                  <Select label="세션 정렬" className="min-w-0" value={sort} onValueChange={(value) => setFilter('sort', value)} options={[
                    { label: '진행 상태 우선', value: 'priority' },
                    { label: '최근 갱신 순', value: 'recent' },
                    { label: '세션 이름순', value: 'name' },
                  ]} />
                </div>
              </div>
              <Tabs
                aria-label="수집 상태 필터"
                value={stateFilter}
                onValueChange={(value) => setFilter('state', value)}
                actions={hasFilters ? <Button onClick={resetFilters} variant="ghost" className="px-1 text-xs">검색·필터 초기화</Button> : undefined}
                items={stateOptions.map((option) => ({ ...option, content: listContent }))}
              />
            </section>
          );
        })() : null}
      <Outlet context={{ restoreCreateFocus: () => createLinkRef.current?.focus() }} />
    </div>
  );
}

export function CollectionConnectionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const context = useOutletContext<CollectionSetupContext | undefined>();
  const openingConsoleRef = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(true);
  const loadSession = useCallback((flywheelPort: ReturnType<typeof useFlywheelPort>) => (
    flywheelPort.getSession(sessionId)
  ), [sessionId]);
  const query = useFlywheelQuery(loadSession);
  const session = query.status === 'ready' && query.data?.kind === 'humanoid' ? query.data : null;
  useAutomaticPreflight(session);
  const finishClose = () => void navigate({
    pathname: openingConsoleRef.current ? `/mlops/collection/${encodeURIComponent(sessionId)}` : '/mlops/collection',
    search: params.toString(),
  }, { replace: true, viewTransition: openingConsoleRef.current });

  if (session !== null && (session.humanDemonstration === null || !['draft', 'ready', 'failed'].includes(session.status))) {
    return <Navigate replace to={`/mlops/collection/${encodeURIComponent(session.id)}`} />;
  }

  return (
    <Dialog open={dialogOpen} title="Quest 연결" cancelLabel="목록으로"
      onOpenChange={setDialogOpen}
      onAfterClose={finishClose}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (!openingConsoleRef.current) context?.restoreCreateFocus();
      }}
      actions={session === null ? undefined : (
        <Button disabled={query.refreshError !== null} onClick={() => {
          openingConsoleRef.current = true;
          setDialogOpen(false);
        }}>수집 콘솔 열기</Button>
      )}
    >
      {query.status === 'loading' ? <QueryFeedback kind="loading" /> : null}
      {query.status === 'error' || query.refreshError !== null ? (
        <QueryFeedback kind="error" message="세션 연결 정보를 불러오지 못했습니다. 다시 조회하세요." onRetry={query.retry} />
      ) : null}
      {query.status === 'ready' && session === null ? <QueryFeedback kind="empty" message="수집 세션을 찾을 수 없습니다." /> : null}
      {session === null ? null : <QuestPairingPanel key={session.id} session={session} disabled={query.refreshError !== null} />}
    </Dialog>
  );
}

export function HumanoidCollectionDetailPage() {
  const [cameraSettingsTarget, setCameraSettingsTarget] = useState<HTMLDivElement | null>(null);
  const [cameraDevicesTarget, setCameraDevicesTarget] = useState<HTMLDivElement | null>(null);
  const [cameraConnectionOpen, setCameraConnectionOpen] = useState(false);
  const cameraConnected = useCallback(() => setCameraConnectionOpen(false), []);
  const { sessionId = '' } = useParams();
  const now = useNow();
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const telemetryQuery = useCollectionTelemetry(sessionId);
  const loadSession = useCallback((value: ReturnType<typeof useFlywheelPort>) => value.getSession(sessionId), [sessionId]);
  const sessionQuery = useFlywheelQuery(loadSession);
  const automaticPreflight = useAutomaticPreflight(sessionQuery.status === 'ready' ? sessionQuery.data : null);
  const episodesQuery = useFlywheelQuery(loadEpisodes);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [selectedDetailsTab, setDetailsTab] = useState<string | null>(null);
  const detailsTab = selectedDetailsTab ?? (sessionQuery.status === 'ready' && sessionQuery.data?.kind === 'humanoid' && sessionQuery.data.humanDemonstration?.profile.id === 'quest-hand-collection-v1' ? 'sources' : 'session');
  const closeDetails = () => {
    setDetailsOpen(false);
    document.getElementById(`collection-tab-${detailsTab}`)?.focus();
  };
  const [pending, setPending] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const leaveAfterExitRef = useRef(false);
  const [exitError, setExitError] = useState<string | null>(null);
  const [retakeDialogOpen, setRetakeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [reviewPositionMs, setReviewPositionMs] = useState(0);
  const [actionStatus, setActionStatus] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [conflictingSessionId, setConflictingSessionId] = useState<string | null>(null);
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
    setConflictingSessionId(null);
    try {
      await action();
      setActionStatus(success);
      return true;
    } catch (reason) {
      setConflictingSessionId(reason instanceof SessionConflictError ? reason.sessionId : null);
      setActionError(reason instanceof SessionConflictError
        ? '다른 세션에서 수집 장치를 사용 중입니다. 해당 세션을 확인하세요.'
        : '작업을 완료하지 못했습니다. 장치 연결과 수집 상태를 확인하고 다시 시도하세요.');
      return false;
    } finally {
      setPending(false);
    }
  }

  const visibleActionError = actionError ?? automaticPreflight.error ?? sessionErrorMessage;

  if (sessionQuery.status === 'ready' && sessionQuery.data === null) {
    return <Navigate replace to="/mlops/collection" />;
  }

  return (
    <>
      {sessionQuery.status !== 'ready' ? <Brand compact linked={false} className="mx-4 mt-3 min-h-0 justify-start" /> : null}
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
          && isEpisodeTransferComplete(activeEpisode)
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
        const requiredSourcesOperational = session.humanDemonstration === null
          || sessionRequiredSourceLabel(session).tone === 'positive';
        const previewUnavailable = telemetryQuery.status === 'error'
          || telemetryQuery.refreshError !== null || sessionQuery.refreshError !== null;
        const requiredPreviewStates = telemetry?.streams.filter((stream) => stream.required && stream.origin !== 'derived')
          .map((stream) => collectionPreviewState(session, telemetry, stream.streamId, now, previewUnavailable)) ?? [];
        const previewConnectionState = session.humanDemonstration === null ? telemetryQuery.effectiveConnectionState : requiredPreviewStates.some((state) => state === 'offline' || state === 'idle') ? 'offline'
          : requiredPreviewStates.some((state) => state === 'stale') ? 'stale' : telemetryQuery.effectiveConnectionState;
        const canStartEpisode = episodeData !== null && session.activeEpisodeId === null
          && (session.status === 'active' || session.status === 'ready')
          && requiredSourcesOperational && (session.humanDemonstration === null || previewConnectionState === 'live') && !automaticPreflight.checking && automaticPreflight.error === null;
        const baseWorkspaceState = getCollectionWorkspaceState(session, activeEpisode);
        const workspaceState = session.humanDemonstration !== null && baseWorkspaceState === 'episode-ready' && previewConnectionState !== 'live' ? 'prepare' : baseWorkspaceState;
        const recordingSummary = getRecordingSummary(session, workspaceState, telemetry, activeEpisode);
        const closeIntent = getCloseIntent(workspaceState, savedEpisodes.length);
        const recordedPreview = activeEpisode?.status === 'finalizing'
          || workspaceState === 'finalizing'
          || workspaceState === 'review';
        const bindings = session.humanDemonstration?.sourceBindings ?? [];
        const awaitingStreamIds = recordedPreview ? [] : session.humanDemonstration?.profile.streams.filter((stream) => (
          bindings.some((source) => source.role === stream.sourceRole && ['pending', 'paired'].includes(source.state))
          && telemetry?.streams.find((item) => item.streamId === stream.streamId)?.lastSampleAtMs == null
        )).map((stream) => stream.streamId) ?? [];
        const questBinding = bindings.find((source) => source.role === 'xr-hand-tracking');
        const questSetupState = !recordedPreview
          && !telemetry?.streams.some((stream) => stream.modality === 'hand-pose' && stream.lastSampleAtMs !== null)
          && (questBinding?.state === 'pending' || questBinding?.state === 'paired')
          ? questBinding.state : undefined;
        const preparationLabel = automaticPreflight.checking ? '연결 확인 중'
          : bindings.length > 0 && bindings.every((source) => source.state === 'pending')
            ? '필수 장치 연결 필요' : '장치 연결 필요';
        const needsQuestConnection = !recordedPreview && session.stoppedAtMs === null
          && session.humanDemonstration?.sourceBindings.some((source) => source.role === 'xr-hand-tracking'
            && ['pending', 'offline', 'error'].includes(source.state)) === true;
        const hasRecording = activeEpisode !== null || savedEpisodes.length > 0 || session.stoppedAtMs !== null;
        const configuredCameraSources = session.sensorPresetId === 'quest-hand-collection-v1' ? [] : session.humanDemonstration === null
          ? humanoidCameraSources
          : humanDemonstrationCameraSources.filter((source) => (
            source.id !== 'external-fullbody-rgb'
            || session.humanDemonstration?.sourceBindings.some((binding) => (
              binding.role === 'external-scene-camera'
            ))
          ));
        const previewStates: Readonly<Record<string, MediaStreamState>> = Object.fromEntries(
          [...configuredCameraSources.map((source) => source.id), 'quest-hand-left', 'quest-hand-right'].map((streamId) => [
            streamId,
            recordedPreview ? 'recorded' : collectionPreviewState(session, telemetry, streamId, now, previewUnavailable),
          ]),
        );
        const cameraSources = configuredCameraSources.map((source) => ({ ...source, meta: '', status: previewStates[source.id] ?? 'idle' }));
        const performClosePrimary = async (): Promise<void> => {
          setPending(true);
          setExitError(null);
          try {
            if (closeIntent.kind === 'stop-recording') {
              if (activeEpisode === null) throw new Error('정지할 Episode를 찾을 수 없습니다.');
              await port.stopEpisode(activeEpisode.id);
              setActionStatus('녹화를 정지하고 수집 목록으로 이동했습니다.');
              leaveAfterExitRef.current = true;
              setExitDialogOpen(false);
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
            leaveAfterExitRef.current = true;
            setExitDialogOpen(false);
          } catch {
            setExitError('종료 작업을 완료하지 못했습니다. 원본 전송과 저장 상태를 확인하고 다시 시도하세요.');
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
          conflictingSessionId,
          preflight: session.preflight,
          refreshError: telemetryQuery.status === 'error' ? telemetryQuery.message : telemetryQuery.refreshError,
          telemetry,
          effectiveConnectionState: previewConnectionState,
          monitoring: !recordedPreview,
          awaitingStreamIds,
        });
        const problemCount = collectionIssues.count + Number(episodesQuery.status === 'error');
        const issuesContent = (
          <div className="grid gap-2 empty:hidden">
            {episodesQuery.status === 'error' ? (
              <section aria-label="Episode 조회 오류" className="shrink-0">
                <QueryFeedback kind="error" message="Episode 기록을 불러오지 못했습니다. 다시 시도해 현재 녹화와 저장 상태를 확인하세요." onRetry={episodesQuery.retry} />
              </section>
            ) : null}
            {episodesQuery.status === 'error' && collectionIssues.count === 0 ? null : <CollectionIssuesSection issues={collectionIssues}
              onCheckConnections={() => {
                setDetailsTab('sources'); setDetailsOpen(true);
                requestAnimationFrame(() => document.getElementById('collection-tab-sources')?.focus());
              }}
              onRetry={() => { telemetryQuery.retry(); sessionQuery.retry(); }} />}
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
              className="flex h-14 shrink-0 items-center gap-2 px-3 text-foreground sm:gap-3 sm:px-4"
              data-collection-header
            >
              <Brand compact linked={false} className="min-h-0" />
              <h1 className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg" title={session.name}>{session.name}</h1>
              <Dropdown
                items={[{ label: '세션 삭제', onSelect: () => setDeleteDialogOpen(true) }]}
                label="세션 메뉴"
                trigger={<Button aria-label="세션 메뉴" className="size-10 min-h-0 p-0" variant="ghost"><Icon name="more" /></Button>}
              />
              <Dialog
                actions={(
                  <>
                    {closeIntent.leaveLabel === null ? null : (
                      <Button
                        disabled={pending}
                        onClick={() => {
                          leaveAfterExitRef.current = true;
                          setExitDialogOpen(false);
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
                cancelDisabled={pending}
                onAfterClose={() => {
                  if (!leaveAfterExitRef.current) return;
                  leaveAfterExitRef.current = false;
                  void navigate({ pathname: '/mlops/collection', search: searchParams.toString() }, { viewTransition: true });
                }}
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
              <DeleteOperationalSessionButton
                onDeleted={() => void navigate({ pathname: '/mlops/collection', search: searchParams.toString() }, { replace: true })}
                onOpenChange={setDeleteDialogOpen}
                open={deleteDialogOpen}
                session={session}
              />
            </header>
            <CollectionWorkspaceLiveStatus
              activeEpisode={activeEpisode}
              effectiveConnectionState={previewConnectionState}
              session={session}
              state={workspaceState}
              preparationLabel={preparationLabel}
              awaitingConnection={awaitingStreamIds.length > 0 && !collectionIssues.connectionProblem}
            />
            <div
              className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 pt-0 sm:p-3 sm:pt-0"
              data-capture-viewport
            >
              {actionError !== null && (!detailsOpen || detailsTab !== 'issues') ? (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[var(--design-radius-control)] bg-status-negative-background px-4 py-3">
                  <p role="alert" className="text-sm text-status-negative-foreground">{actionError}</p>
                  <Button variant="secondary" onClick={() => {
                    setDetailsTab('issues'); setDetailsOpen(true);
                    requestAnimationFrame(() => document.getElementById('collection-tab-issues')?.focus());
                  }}>문제 확인</Button>
                </div>
              ) : null}
              <RailTabs
                className="collection-workspace"
                data-inspector-open={detailsOpen}
                value={detailsOpen ? detailsTab : ''}
                onValueChange={(value) => { setDetailsTab(value); setDetailsOpen(true); }}
              >
              <div
                className="collection-preview"
                data-preview-workspace
              >
                <div className={reviewEpisode === null
                  ? 'h-full min-h-0'
                  : 'collection-review-layout grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2'}>
                  <BrowserCameraWorkspace
                    settingsTarget={cameraSettingsTarget} connectedTarget={cameraDevicesTarget} onConnected={cameraConnected}
                    emptyState={<CollectionEmptyState showConnect={!detailsOpen || detailsTab !== 'sources'} onConnect={() => {
                      setDetailsTab('sources');
                      setDetailsOpen(true);
                      requestAnimationFrame(() => document.getElementById('collection-tab-sources')?.focus());
                    }} />}
                    {...(session.humanDemonstration !== null && port.supportsBrowserCameras === true && reviewEpisode === null && session.stoppedAtMs === null ? { sessionId: session.id } : {})}>
                  {session.humanDemonstration !== null && cameraSources.length === 0
                    && !hasHandPreview(previewStates) ? null : <SessionCollectionPreview
                    ariaLabel={recordedPreview ? 'Episode 기록 미리보기' : '실시간 수집 모니터'}
                    cameraSources={cameraSources}
                    cameraTitle={recordedPreview ? '기록된 Episode 카메라' : '실시간 수집 카메라'}
                    humanDemonstration={session.humanDemonstration !== null}
                    playbackPlaying={reviewPlaying}
                    playbackPositionMs={reviewPositionMs}
                    replayEpisodeId={reviewEpisode?.id ?? null}
                    telemetry={telemetry}
                    previewStates={previewStates}
                  />}
                  </BrowserCameraWorkspace>

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

              <Surface
                as="aside"
                layer="raised"
                aria-label="수집 상세"
                className="collection-inspector"
                hidden={!detailsOpen}
                id="collection-details"
                tabIndex={-1}
              >
                <div className="collection-inspector-tabs">
                <RailTabPanel value="session" labelledBy="collection-tab-session" forceMount hidden={detailsTab !== 'session'}>
                  <section aria-label="세션 정보">
                    <section aria-label="작업 지시" className="mb-5 min-w-0">
                      <h3 className="text-base font-semibold">작업 지시</h3>
                      <p className="collection-instruction mt-2 break-words text-sm leading-relaxed" tabIndex={0}>{session.instruction}</p>
                    </section>
                    {hasRecording ? <dl className="collection-recording-fields grid gap-4 pb-5 text-sm">
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
                    </dl> : null}
                    <section className="pt-2" aria-label="수집 설정">
                      <h3 className="text-base font-semibold">수집 설정</h3>
                      <dl className="collection-session-fields text-sm">
                        <div><dt>작업 ID</dt><dd className="font-mono">{session.taskId}</dd></div>
                        <div><dt>프로젝트 ID</dt><dd className="font-mono">{session.projectId}</dd></div>
                        <div><dt>현장 ID</dt><dd className="font-mono">{session.siteId}</dd></div>
                      </dl>
                    </section>
                    <section className="mt-6" aria-label="세션 기록">
                      <h3 className="text-base font-semibold">세션 기록</h3>
                      <dl className="collection-session-fields text-sm">
                        {session.humanDemonstration === null ? null : <div><dt>참여자</dt><dd className="font-mono">{session.humanDemonstration.participantId}</dd></div>}
                        <div><dt>세션 ID</dt><dd className="font-mono">{session.id}</dd></div>
                        <div><dt>생성 시각</dt><dd>{formatDateTime(session.createdAtMs)}</dd></div>
                        <div><dt>시작 시각</dt><dd>{session.startedAtMs === null ? '시작 전' : formatDateTime(session.startedAtMs)}</dd></div>
                        {session.stoppedAtMs === null ? null : <div><dt>종료 시각</dt><dd>{formatDateTime(session.stoppedAtMs)}</dd></div>}
                      </dl>
                    </section>
                  </section>
                </RailTabPanel>
                <RailTabPanel value="sources" labelledBy="collection-tab-sources" forceMount hidden={detailsTab !== 'sources'}>
                    <div className="grid gap-5">
                      <CollectionStreamsSection telemetry={telemetry} questSetupState={questSetupState} connectionState={collectionIssues.connectionProblem ? previewConnectionState : 'live'} questConnection={!needsQuestConnection ? null : (
                        <Dialog title="Quest 연결" cancelLabel="닫기" trigger={<Button variant="secondary" disabled={pending}>Quest 연결</Button>}>
                          <QuestPairingPanel key={session.id} session={session} />
                        </Dialog>
                      )} cameraConnection={session.humanDemonstration !== null && session.stoppedAtMs === null && port.supportsBrowserCameras === true && reviewEpisode === null ? (
                        <Dialog title="카메라 연결" open={cameraConnectionOpen} onOpenChange={setCameraConnectionOpen} cancelLabel="닫기" trigger={<Button variant="secondary">카메라 연결</Button>}>
                          <div ref={setCameraSettingsTarget} />
                        </Dialog>
                      ) : null} cameraDevices={<div ref={setCameraDevicesTarget} className="grid" />} />
                      {session.humanDemonstration === null ? null : <CollectorCommandStatus binding={session.humanDemonstration} />}
                      {session.humanDemonstration?.profile.id === 'human-demo-quest-hand-v1' && session.stoppedAtMs === null ? <CollectionCameraPanel key={session.id} /> : null}

                    </div>
                </RailTabPanel>
                <RailTabPanel value="issues" labelledBy="collection-tab-issues">{issuesContent}</RailTabPanel>
                </div>
              </Surface>
              <RailTabList aria-label="수집 상세 메뉴" className="collection-details-rail">
                {([
                  { value: 'session', label: '세션 정보', shortLabel: '세션', icon: 'table' },
                  { value: 'sources', label: '장치', shortLabel: '장치', icon: 'activity' },
                  { value: 'issues', label: '문제', shortLabel: '문제', icon: 'events' },
                ] as const).map((item) => (
                  <RailTab
                    key={item.value}
                    id={`collection-tab-${item.value}`}
                    value={item.value}
                    label={item.label}
                    shortLabel={item.shortLabel}
                    icon={item.icon}
                    count={item.value === 'issues' ? problemCount : 0}
                    onReselect={closeDetails}
                  />
                ))}
              </RailTabList>
              </RailTabs>
            </div>
                  <StickyActionBar
                    appearance="plain"
                    aria-label="수집 작업 컨트롤"
                    className="@container static grid shrink-0 gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:flex-wrap sm:items-center sm:justify-between"
                    data-collection-state={workspaceState}
                    position="contained"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-episode-summary>
                        <StatusIndicator
                          label={episodeData === null
                            ? 'Episode 상태 확인 필요'
                            : `${activeEpisode === null || workspaceState === 'processing' ? '' : `${activeEpisode.name} · `}${workspaceState === 'prepare' ? preparationLabel : getWorkspaceStateLabel(workspaceState, activeEpisode)}`}
                          pulse={workspaceState === 'recording'}
                          tone={episodeData === null ? 'warning' : workspaceState === 'recording' ? 'negative' : workspaceTone(workspaceState)}
                        />
                        {activeEpisode?.status === 'recording' ? <span aria-label="녹화 경과 시간" className="text-2xl font-semibold tabular-nums"><RecordingElapsedTime episode={activeEpisode} /></span> : null}
                        {episodeData === null || savedEpisodes.length === 0 ? null : <span className="text-xs tabular-nums text-muted">저장 완료 {savedEpisodes.length}개</span>}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-3 max-sm:[&>button]:flex-1" data-cycle-control-anchor>
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
                          cancelDisabled={pending}
                          description="현재 녹화본은 복구할 수 없으며, 삭제 후 바로 새 녹화를 시작합니다."
                          onOpenChange={setRetakeDialogOpen}
                          open={retakeDialogOpen}
                          title="이 녹화본을 삭제하고 다시 녹화할까요?"
                          trigger={reviewEpisode === null ? undefined : (
                            <Button disabled={pending} variant="secondary"><Icon name="restart" />다시 녹화</Button>
                          )}
                        />
                      {activeEpisode?.status === 'finalizing' && activeEpisode.finalizationError !== null ? (
                        <Button
                          disabled={pending}
                          onClick={() => void run(() => port.invalidateEpisode(activeEpisode.id), 'Episode를 invalid로 보존하고 계속합니다.')}
                          variant="secondary"
                        >
                          Episode 제외
                        </Button>
                      ) : null}
                      {session.stoppedAtMs === null
                        && session.activeEpisodeId === null
                        && ['draft', 'ready', 'active', 'failed'].includes(session.status)
                        && awaitingStreamIds.length === 0
                        && !canStartEpisode ? (
                          <Button disabled>{automaticPreflight.checking ? '연결 확인 중' : '장치 연결 대기'}</Button>
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
    </>
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
