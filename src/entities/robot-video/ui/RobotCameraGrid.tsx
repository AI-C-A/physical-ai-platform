import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { flushSync } from 'react-dom';

import { useAsyncQuery } from '@/shared/lib/async-query';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Checkbox } from '@/shared/ui/checkbox';
import { Icon } from '@/shared/ui/icon';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Spinner } from '@/shared/ui/spinner';

import type { SegmentationLabel } from '../api/segmentation-client';
import { useCameraSegmentationSync } from '../model/camera-segmentation-sync';
import { useRobotVideoPort } from '../model/robot-video-context';
import type {
  RobotVideoPort,
  RobotVideoRecordingCapability,
  RobotVideoRecordingSession,
  RobotVideoSource,
  VideoConnectionStatus,
} from '../model/robot-video';
import { useSegmentationOverlay } from './use-segmentation-overlay';

const videoStatusLabels = {
  connecting: '영상 불러오는 중',
  connected: '영상 표시 중',
  reconnecting: '영상 다시 불러오는 중',
  disconnected: '영상 끊김',
  error: '영상을 불러오지 못함',
} as const satisfies Record<VideoConnectionStatus, string>;

const cameraCopy = {
  connectionError: '카메라 영상을 불러오지 못했습니다.',
  disconnected: '카메라 영상이 끊겼습니다.',
  loading: '카메라 영상을 불러오는 중입니다.',
  reconnecting: '카메라 영상을 다시 불러오는 중입니다.',
  sourceListError: '카메라 목록을 불러오지 못했습니다.',
} as const;

interface VideoAspectRatio {
  readonly cssValue: string;
  readonly numericValue: number;
}

const defaultVideoAspectRatio: VideoAspectRatio = {
  cssValue: '16 / 9',
  numericValue: 16 / 9,
};

function getConnectionProblemMessage(status: VideoConnectionStatus): string {
  return status === 'disconnected'
    ? cameraCopy.disconnected
    : cameraCopy.connectionError;
}

interface CameraViewTransition {
  readonly finished: Promise<unknown>;
}

interface VideoTileStyle extends CSSProperties {
  readonly aspectRatio: string;
  readonly height: string;
  readonly width: string;
}

type CameraTransitionDocument = Document & {
  readonly startViewTransition?: (
    update: () => void,
  ) => CameraViewTransition;
};

function updateCameraLayout(update: () => void): Promise<void> {
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const transitionDocument = document as CameraTransitionDocument;

  if (prefersReducedMotion || transitionDocument.startViewTransition === undefined) {
    flushSync(update);
    return Promise.resolve();
  }

  const transition = transitionDocument.startViewTransition(() => {
    flushSync(update);
  });
  return transition.finished.then(() => undefined, () => undefined);
}

function getVideoStatusTone(
  status: VideoConnectionStatus,
): 'neutral' | 'positive' | 'warning' | 'negative' {
  if (status === 'connected') return 'positive';
  if (status === 'error') return 'negative';
  if (status === 'disconnected') return 'neutral';
  return 'warning';
}

function SegmentationLabels({
  labels,
}: {
  readonly labels: readonly SegmentationLabel[];
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-segmentation-labels="true"
    >
      {labels.map((label, index) => (
        <span
          className="absolute max-w-40 truncate rounded-sm px-1 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap text-neutral-950 shadow-sm"
          key={`${label.className}-${String(index)}`}
          style={{
            backgroundColor: label.color,
            top: `${String(label.top * 100)}%`,
            transform: label.top < 0.08
              ? 'translateY(2px)'
              : 'translateY(calc(-100% - 2px))',
            ...(label.left > 0.72
              ? { right: `${String((1 - label.right) * 100)}%` }
              : { left: `${String(label.left * 100)}%` }),
          }}
        >
          {label.className}
          {label.confidence === null ? null : ` ${label.confidence.toFixed(2)}`}
        </span>
      ))}
    </div>
  );
}

function VideoSurface({
  segmentationEnabled,
  onAspectRatioChange,
  presentation,
  stream,
  label,
}: {
  readonly segmentationEnabled?: boolean;
  readonly onAspectRatioChange?: (width: number, height: number) => void;
  readonly presentation: 'default' | 'compact' | 'monitoring';
  readonly stream: MediaStream;
  readonly label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLImageElement>(null);
  const synchronizedFrameRef = useRef<HTMLCanvasElement>(null);
  const cameraSegmentationSync = useCameraSegmentationSync();
  const synchronizeVideo = (segmentationEnabled ?? false)
    && cameraSegmentationSync;

  const segmentationOverlay = useSegmentationOverlay({
    enabled: segmentationEnabled ?? false,
    overlayRef,
    synchronizedFrameRef,
    synchronizeVideo,
    videoRef,
  });
  const isSegmentationLoading = segmentationOverlay.status === 'idle'
    || segmentationOverlay.status === 'loading';

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    const syncAspectRatio = (): void => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
      onAspectRatioChange?.(video.videoWidth, video.videoHeight);
    };
    video.addEventListener('loadedmetadata', syncAspectRatio);
    video.addEventListener('resize', syncAspectRatio);
    video.srcObject = stream;
    syncAspectRatio();
    void video.play().catch(() => undefined);
    return () => {
      video.removeEventListener('loadedmetadata', syncAspectRatio);
      video.removeEventListener('resize', syncAspectRatio);
      video.srcObject = null;
    };
  }, [onAspectRatioChange, stream]);

  return (
    <>
      <video
      aria-label={label}
      autoPlay
      className={
        presentation === 'monitoring'
          ? 'absolute inset-0 h-full w-full bg-neutral-950 object-contain'
          : presentation === 'compact'
            ? 'h-40 w-full bg-neutral-950 object-contain'
            : 'aspect-video w-full bg-neutral-950 object-contain'
      }
      muted
      playsInline
        ref={videoRef}
      />
      {segmentationEnabled === true ? (
        <>
          {synchronizeVideo ? (
            <canvas
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${
                segmentationOverlay.synchronizedFrameReady ? '' : 'invisible'
              }`}
              data-segmentation-synchronized-frame="true"
              ref={synchronizedFrameRef}
            />
          ) : null}
          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            data-segmentation-overlay="true"
            ref={overlayRef}
          />
          <SegmentationLabels labels={segmentationOverlay.labels} />
          <div
            aria-atomic="true"
            aria-busy={isSegmentationLoading}
            className={
              segmentationOverlay.status === 'error'
                ? 'pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-gradient-to-r from-red-950/90 via-red-950/70 to-transparent px-2 py-1 pr-6 font-mono text-[11px] font-medium tabular-nums text-red-100'
                : 'pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-gradient-to-r from-black/75 via-black/55 to-transparent px-2 py-1 pr-6 font-mono text-[11px] font-medium tabular-nums text-white'
            }
            data-segmentation-metrics="true"
            data-segmentation-status={segmentationOverlay.status}
            role="status"
          >
            {isSegmentationLoading ? (
              <Spinner
                className="size-3 shrink-0"
                data-segmentation-loading-spinner="true"
              />
            ) : null}
            <span>
              {segmentationOverlay.status === 'error'
                ? 'AI 분석 실패 · 다시 시도 중'
                : segmentationOverlay.metrics === null
                  ? 'AI 분석 중'
                  : `${synchronizeVideo ? '동기화 · ' : ''}지연 ${String(Math.round(segmentationOverlay.metrics.latencyMs))} ms · 처리 ${segmentationOverlay.metrics.framesPerSecond.toFixed(1)} FPS`}
            </span>
          </div>
        </>
      ) : null}
    </>
  );
}

function CameraCard({
  accessibleSourceName,
  canFocus,
  isFocused,
  isSelected,
  onFocusChange,
  onSelect,
  onStatusChange,
  port,
  presentation,
  source,
}: {
  readonly accessibleSourceName: string;
  readonly canFocus: boolean;
  readonly isFocused: boolean;
  readonly isSelected: boolean;
  readonly onFocusChange: () => void;
  readonly onSelect: () => void;
  readonly onStatusChange?: (
    sourceId: string,
    status: VideoConnectionStatus | null,
  ) => void;
  readonly port: RobotVideoPort;
  readonly presentation: 'grid' | 'monitoring' | 'multi-monitoring' | 'workspace';
  readonly source: RobotVideoSource;
}) {
  const [retrySequence, setRetrySequence] = useState(0);
  const [status, setStatus] =
    useState<VideoConnectionStatus>('connecting');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [segmentationEnabled, setSegmentationEnabled] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>(
    defaultVideoAspectRatio,
  );
  const hasConnectionProblem = status === 'error' || status === 'disconnected';
  const isPending = status === 'connecting' || status === 'reconnecting';
  const problemMessage = hasConnectionProblem
    ? getConnectionProblemMessage(status)
    : null;

  const statusAnnouncement = `${accessibleSourceName}: ${
    problemMessage
      ?? (status === 'connecting' && retrySequence > 0
        ? videoStatusLabels.reconnecting
        : videoStatusLabels[status])
  }`;
  const updateVideoAspectRatio = useCallback((width: number, height: number) => {
    setVideoAspectRatio({
      cssValue: `${String(width)} / ${String(height)}`,
      numericValue: width / height,
    });
  }, []);

  useEffect(() => {
    onStatusChange?.(source.id, status);
  }, [onStatusChange, source.id, status]);

  useEffect(() => {
    return () => onStatusChange?.(source.id, null);
  }, [onStatusChange, source.id]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let closeSession: (() => void) | null = null;
    let unsubscribeStatus: (() => void) | null = null;
    const releaseSession = (): void => {
      const unsubscribe = unsubscribeStatus;
      const close = closeSession;
      unsubscribeStatus = null;
      closeSession = null;

      [unsubscribe, close].forEach((cleanup) => {
        try {
          cleanup?.();
        } catch {
          // 상태 구독 해제 오류가 MediaStream session 정리를 막지 않는다.
        }
      });
    };

    void port.openSource(source.id, controller.signal).then(
      (session) => {
        if (!active) {
          try {
            session.close();
          } catch {
            // 이미 이탈한 화면에는 오류를 표시할 수 없으므로 session 정리만 시도한다.
          }
          return;
        }
        try {
          closeSession = () => session.close();
          unsubscribeStatus = session.subscribeStatus(setStatus);
          setStream(session.mediaStream);
        } catch {
          releaseSession();
          setStream(null);
          setStatus('error');
        }
      },
      () => {
        if (!active) return;
        setStatus('error');
      },
    );

    return () => {
      active = false;
      releaseSession();
      controller.abort();
    };
  }, [port, retrySequence, source.id]);

  if (presentation === 'monitoring' || presentation === 'multi-monitoring') {
    const pendingLabel = status === 'reconnecting' || retrySequence > 0
      ? cameraCopy.reconnecting
      : cameraCopy.loading;
    const maxTileHeight = isFocused
      ? presentation === 'multi-monitoring'
        ? 'calc(100dvh - 1.5rem)'
        : '100cqh'
      : 'var(--camera-tile-max-height)';
    const maxTileWidth = isFocused
      ? presentation === 'multi-monitoring'
        ? 'calc(100dvw - 1.5rem)'
        : '100cqw'
      : 'var(--camera-tile-max-width)';
    const videoTileStyle: VideoTileStyle = {
      aspectRatio: videoAspectRatio.cssValue,
      height: `min(${maxTileHeight}, calc(${maxTileWidth} / ${String(videoAspectRatio.numericValue)}))`,
      width: `min(${maxTileWidth}, calc(${maxTileHeight} * ${String(videoAspectRatio.numericValue)}))`,
    };

    return (
      <div
        className={presentation === 'multi-monitoring'
          ? 'group relative max-h-full max-w-full overflow-hidden rounded-[var(--design-radius-soft-group)] bg-neutral-950'
          : 'group relative max-h-full max-w-full overflow-hidden rounded-lg bg-neutral-950 ring-1 ring-white/15'}
        data-camera-tile="true"
        style={videoTileStyle}
      >
        {hasConnectionProblem ? (
          <p aria-atomic="true" className="sr-only" role="alert">
            {statusAnnouncement}
          </p>
        ) : null}
        {stream === null ? null : (
          <VideoSurface
            label={`${accessibleSourceName} 영상`}
            onAspectRatioChange={updateVideoAspectRatio}
            presentation="monitoring"
            segmentationEnabled={segmentationEnabled}
            stream={stream}
          />
        )}
        <div className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex min-w-0 items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent ${presentation === 'multi-monitoring' ? 'p-2 pb-7' : 'p-3 pb-8'}`}>
          <h2 className={`truncate font-semibold text-white ${presentation === 'multi-monitoring' ? 'text-xs' : 'text-sm'}`}>
            {source.displayName}
          </h2>
          <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-md bg-black/55 p-0.5 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            {stream !== null ? (
              <Button
                aria-label={`${accessibleSourceName} 세그멘테이션 ${segmentationEnabled ? '끄기' : '켜기'}`}
                aria-pressed={segmentationEnabled}
                className="size-10 min-h-[var(--layout-control-height)] border-transparent bg-transparent p-0 text-xs text-white hover:bg-white/15 active:bg-white/20 aria-pressed:bg-white/15"
                onClick={() => setSegmentationEnabled((value) => !value)}
                title={`AI 세그멘테이션 ${segmentationEnabled ? '끄기' : '켜기'}`}
                variant="ghost"
              >
                AI
              </Button>
            ) : null}
            {canFocus && (stream !== null || isFocused) ? (
              <Button
                aria-label={isFocused
                  ? `${accessibleSourceName} 확대 보기 종료`
                  : `${accessibleSourceName} 확대 보기`}
                aria-pressed={isFocused}
                className="size-10 min-h-[var(--layout-control-height)] border-transparent bg-transparent p-0 text-white hover:bg-white/15 active:bg-white/20 aria-pressed:bg-white/15"
                data-camera-focus-control="true"
                onClick={onFocusChange}
                title={isFocused ? '전체 카메라 보기' : `${source.displayName} 확대 보기`}
                variant="ghost"
              >
                <Icon name={isFocused ? 'minimize' : 'maximize'} size="md" />
              </Button>
            ) : null}
          </div>
        </div>
        {isPending || hasConnectionProblem ? (
          <div
            className={`absolute inset-0 z-0 grid place-content-center gap-3 px-6 text-center text-sm text-neutral-100 ${stream === null ? '' : 'bg-black/45'}`}
            data-camera-state={status}
          >
            {isPending ? (
              <Spinner
                className="size-5 justify-self-center"
                data-loading-spinner="true"
                label={pendingLabel}
              />
            ) : (
              <>
                <p>{problemMessage}</p>
                <Button
                  className="justify-self-center border-white/15 bg-black/50 text-white hover:bg-black/70 active:bg-black/80"
                  onClick={() => {
                    setStatus('connecting');
                    setStream(null);
                    setVideoAspectRatio(defaultVideoAspectRatio);
                    setRetrySequence((value) => value + 1);
                  }}
                  variant="ghost"
                >
                  다시 연결
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Panel title={source.displayName}>
      <p
        aria-atomic="true"
        aria-label={statusAnnouncement}
        className="sr-only"
        role={status === 'error' ? 'alert' : 'status'}
      >
        {statusAnnouncement}
      </p>
      {isPending ? null : (
        <div className="mb-3">
          <Badge tone={getVideoStatusTone(status)}>
            {videoStatusLabels[status]}
          </Badge>
        </div>
      )}
      {stream === null ? (
        isPending ? (
          <Spinner className="mx-auto size-5" />
        ) : <p>{problemMessage}</p>
      ) : (
        <VideoSurface
          label={`${accessibleSourceName} 영상`}
          presentation={presentation === 'workspace' && !isSelected ? 'compact' : 'default'}
          stream={stream}
        />
      )}
      {status === 'error' || status === 'disconnected' ? (
        <div className="mt-3">
          <Button
            onClick={() => {
              setStatus('connecting');
              setStream(null);
              setRetrySequence((value) => value + 1);
            }}
            variant="secondary"
          >
            다시 연결
          </Button>
        </div>
      ) : null}
      {presentation === 'workspace' && !isSelected ? (
        <Button className="mt-3 w-full" onClick={onSelect} variant="secondary">
          {source.displayName} 크게 보기
        </Button>
      ) : null}
    </Panel>
  );
}

interface RobotCameraGridProps {
  readonly focusedSourceId?: string | null;
  readonly onFocusedSourceChange?: (sourceId: string | null) => void;
  readonly onSourceStatusChange?: (
    sourceId: string,
    status: VideoConnectionStatus | null,
  ) => void;
  readonly presentation?: 'grid' | 'monitoring' | 'multi-monitoring' | 'workspace';
  readonly recordingEnabled?: boolean;
  readonly robotId: string;
  readonly sourceLabelPrefix?: string;
}

interface RecordingDownload {
  readonly fileName: string;
  readonly label: string;
  readonly url: string;
}

function CameraRecordingControls({
  recording,
  robotId,
  sources,
}: {
  readonly recording: RobotVideoRecordingCapability;
  readonly robotId: string;
  readonly sources: readonly RobotVideoSource[];
}) {
  const [selectedSourceIds, setSelectedSourceIds] = useState<readonly string[]>(
    () => sources.map((source) => source.id),
  );
  const [status, setStatus] = useState<'idle' | 'starting' | 'recording' | 'stopping'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<readonly RecordingDownload[]>([]);
  const sessionRef = useRef<RobotVideoRecordingSession | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const downloadsRef = useRef<readonly RecordingDownload[]>([]);

  const replaceDownloads = useCallback((next: readonly RecordingDownload[]) => {
    downloadsRef.current.forEach((download) => URL.revokeObjectURL(download.url));
    downloadsRef.current = next;
    setDownloads(next);
  }, []);

  useEffect(() => () => {
    controllerRef.current?.abort();
    sessionRef.current?.cancel();
    downloadsRef.current.forEach((download) => URL.revokeObjectURL(download.url));
  }, []);

  const start = async (): Promise<void> => {
    if (status !== 'idle' || selectedSourceIds.length === 0) return;
    setError(null);
    replaceDownloads([]);
    setStatus('starting');
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const session = await recording.startRecording({
        robotId,
        sourceIds: selectedSourceIds,
      }, controller.signal);
      if (controller.signal.aborted) {
        session.cancel();
        return;
      }
      sessionRef.current = session;
      setStatus('recording');
    } catch (startError: unknown) {
      if (!controller.signal.aborted) {
        setError(startError instanceof Error
          ? startError.message
          : '카메라 원본 녹화를 시작하지 못했습니다.');
        setStatus('idle');
      }
    }
  };

  const stop = async (): Promise<void> => {
    const session = sessionRef.current;
    if (status !== 'recording' || session === null) return;
    setError(null);
    setStatus('stopping');
    try {
      const result = await session.stop();
      const mediaDownloads = result.artifacts.map((artifact) => ({
        fileName: artifact.fileName,
        label: `${artifact.fileName} 다운로드`,
        url: URL.createObjectURL(artifact.blob),
      }));
      const manifestBlob = new Blob(
        [JSON.stringify(result.manifest, null, 2)],
        { type: 'application/json' },
      );
      replaceDownloads([
        ...mediaDownloads,
        {
          fileName: result.manifestFileName,
          label: `${result.manifestFileName} 다운로드`,
          url: URL.createObjectURL(manifestBlob),
        },
      ]);
    } catch (stopError: unknown) {
      setError(stopError instanceof Error
        ? stopError.message
        : '카메라 원본 녹화를 마감하지 못했습니다.');
    } finally {
      sessionRef.current = null;
      controllerRef.current = null;
      setStatus('idle');
    }
  };

  const isBusy = status !== 'idle';
  return (
    <Panel title="카메라 원본 녹화">
      <p className="text-sm text-muted">
        논리 카메라를 선택하면 원본 영상과 분할 메타데이터를 함께 기록합니다.
      </p>
      <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">녹화할 카메라</legend>
        {sources.map((source) => (
          <Checkbox
            checked={selectedSourceIds.includes(source.id)}
            disabled={isBusy}
            key={source.id}
            label={source.displayName}
            onCheckedChange={(checked) => {
              setSelectedSourceIds((current) => checked
                ? [...current, source.id]
                : current.filter((sourceId) => sourceId !== source.id));
            }}
          />
        ))}
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === 'recording' || status === 'stopping' ? (
          <Button
            isLoading={status === 'stopping'}
            onClick={() => void stop()}
          >
            원본 녹화 중지
          </Button>
        ) : (
          <Button
            disabled={selectedSourceIds.length === 0}
            isLoading={status === 'starting'}
            onClick={() => void start()}
          >
            원본 녹화 시작
          </Button>
        )}
        {status === 'recording' ? (
          <Badge tone="negative">녹화 중</Badge>
        ) : null}
      </div>
      {error === null ? null : <ErrorMessage className="mt-3">{error}</ErrorMessage>}
      {downloads.length === 0 ? null : (
        <div className="mt-3" role="status">
          <p className="text-sm font-semibold">녹화가 완료되었습니다.</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {downloads.map((download) => (
              <li key={download.fileName}>
                <a className="font-semibold underline" download={download.fileName} href={download.url}>
                  {download.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

type MonitoringGridStyle = CSSProperties & {
  readonly '--camera-columns-compact': number;
  readonly '--camera-columns-wide': number;
  readonly '--camera-rows-compact': number;
  readonly '--camera-rows-wide': number;
  readonly '--camera-tile-max-height-compact': string;
  readonly '--camera-tile-max-height-wide': string;
  readonly '--camera-tile-max-width-compact': string;
  readonly '--camera-tile-max-width-wide': string;
  readonly containerType: 'size';
};

interface MonitoringGridLayout {
  readonly compactColumns: number;
  readonly compactRows: number;
  readonly style: MonitoringGridStyle;
  readonly wideLogicalColumns: number;
  readonly wideRows: number;
}

type CameraTileStyle = CSSProperties & {
  readonly viewTransitionName: string;
};

function getTileTrackSize(
  dimension: 'cqh' | 'cqw',
  trackCount: number,
  gap: number,
): string {
  const totalGap = (trackCount - 1) * gap;
  return `calc((100${dimension} - ${String(totalGap)}px) / ${String(trackCount)})`;
}

function getMonitoringGridLayout(
  sourceCount: number,
  gap: { readonly compact: number; readonly wide: number },
): MonitoringGridLayout {
  const compactColumns = sourceCount <= 2
    ? 1
    : Math.min(2, Math.ceil(Math.sqrt(sourceCount)));
  const compactRows = Math.ceil(sourceCount / compactColumns);
  const wideLogicalColumns = Math.ceil(Math.sqrt(sourceCount));
  const wideRows = Math.ceil(sourceCount / wideLogicalColumns);
  const wideColumns = sourceCount === 5 ? 6 : wideLogicalColumns;

  return {
    compactColumns,
    compactRows,
    style: {
      '--camera-columns-compact': compactColumns,
      '--camera-columns-wide': wideColumns,
      '--camera-rows-compact': compactRows,
      '--camera-rows-wide': wideRows,
      '--camera-tile-max-height-compact': getTileTrackSize(
        'cqh',
        compactRows,
        gap.compact,
      ),
      '--camera-tile-max-height-wide': getTileTrackSize(
        'cqh',
        wideRows,
        gap.wide,
      ),
      '--camera-tile-max-width-compact': getTileTrackSize(
        'cqw',
        compactColumns,
        gap.compact,
      ),
      '--camera-tile-max-width-wide': getTileTrackSize(
        'cqw',
        wideLogicalColumns,
        gap.wide,
      ),
      containerType: 'size',
    },
    wideLogicalColumns,
    wideRows,
  };
}

function getFiveSourcePlacementClass(
  sourceIndex: number,
  sourceCount: number,
  isFocused: boolean,
): string {
  if (sourceCount !== 5 || isFocused) return '';
  if (sourceIndex < 3) return 'sm:col-span-2';
  return sourceIndex === 3
    ? 'sm:col-span-2 sm:col-start-2 sm:row-start-2'
    : 'sm:col-span-2 sm:col-start-4 sm:row-start-2';
}

export function RobotCameraGrid({
  focusedSourceId: controlledFocusedSourceId,
  onFocusedSourceChange,
  onSourceStatusChange,
  presentation = 'grid',
  recordingEnabled = false,
  robotId,
  sourceLabelPrefix,
}: RobotCameraGridProps) {
  const port = useRobotVideoPort();
  const load = useCallback(async () => {
    try {
      return await port.listSources(robotId);
    } catch (error: unknown) {
      throw new Error(cameraCopy.sourceListError, { cause: error });
    }
  }, [port, robotId]);
  const sources = useAsyncQuery(load);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const focusContextKey = `${presentation}:${robotId}`;
  const [focusedCamera, setFocusedCamera] = useState<{
    readonly contextKey: string;
    readonly sourceId: string;
  } | null>(null);
  const uncontrolledFocusedSourceId = focusedCamera?.contextKey === focusContextKey
    ? focusedCamera.sourceId
    : null;
  const focusedSourceId = controlledFocusedSourceId === undefined
    ? uncontrolledFocusedSourceId
    : controlledFocusedSourceId;
  const sourceRegionRefs = useRef(new Map<string, HTMLDivElement>());
  const shouldFocusSelectionRef = useRef(false);

  useEffect(() => {
    if (!shouldFocusSelectionRef.current || selectedSourceId === null) return;
    shouldFocusSelectionRef.current = false;
    sourceRegionRefs.current.get(selectedSourceId)?.focus();
  }, [selectedSourceId]);

  const changeFocusedSource = useCallback((sourceId: string | null) => {
    return updateCameraLayout(() => {
      if (onFocusedSourceChange !== undefined) {
        onFocusedSourceChange(sourceId);
        return;
      }
      setFocusedCamera(
        sourceId === null ? null : { contextKey: focusContextKey, sourceId },
      );
    });
  }, [focusContextKey, onFocusedSourceChange]);

  useEffect(() => {
    if (focusedSourceId === null) return;
    const sourceId = focusedSourceId;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      void changeFocusedSource(null).then(() => {
        sourceRegionRefs.current
          .get(sourceId)
          ?.querySelector<HTMLButtonElement>('[data-camera-focus-control="true"]')
          ?.focus();
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeFocusedSource, focusedSourceId]);

  if (sources.status === 'loading') {
    return <QueryFeedback kind="loading" />;
  }
  if (sources.status === 'error') {
    return <QueryFeedback kind="error" message={sources.message} onRetry={sources.retry} />;
  }
  if (sources.data.length === 0) {
    return <QueryFeedback kind="empty" message="사용 가능한 카메라 소스가 없습니다." />;
  }

  const activeSourceId = sources.data.some(
    (source) => source.id === selectedSourceId,
  )
    ? selectedSourceId
    : (sources.data[0]?.id ?? null);
  const orderedSources =
    presentation === 'workspace'
      ? [
          ...sources.data.filter((source) => source.id === activeSourceId),
          ...sources.data.filter((source) => source.id !== activeSourceId),
        ]
      : sources.data;
  const isMonitoringPresentation = presentation === 'monitoring'
    || presentation === 'multi-monitoring';
  const isMultiMonitoringPresentation = presentation === 'multi-monitoring';
  const monitoringGridLayout = isMonitoringPresentation
    ? getMonitoringGridLayout(
        orderedSources.length,
        isMultiMonitoringPresentation
          ? { compact: 2, wide: 2 }
          : { compact: 8, wide: 12 },
      )
    : undefined;
  const validFocusedSourceId = isMonitoringPresentation
    && orderedSources.some((source) => source.id === focusedSourceId)
      ? focusedSourceId
      : null;

  return (
    <>
      {recordingEnabled && port.recording !== undefined ? (
        <CameraRecordingControls
          key={`${robotId}:${sources.data.map((source) => source.id).join('|')}`}
          recording={port.recording}
          robotId={robotId}
          sources={sources.data}
        />
      ) : null}
      <section
      aria-label="카메라 영상"
      className={
        isMonitoringPresentation
          ? `relative grid h-full min-h-0 w-full place-content-center grid-cols-[repeat(var(--camera-columns-compact),max-content)] grid-rows-[repeat(var(--camera-rows-compact),max-content)] overflow-hidden [--camera-tile-max-height:var(--camera-tile-max-height-compact)] [--camera-tile-max-width:var(--camera-tile-max-width-compact)] sm:grid-cols-[repeat(var(--camera-columns-wide),max-content)] sm:grid-rows-[repeat(var(--camera-rows-wide),max-content)] sm:[--camera-tile-max-height:var(--camera-tile-max-height-wide)] sm:[--camera-tile-max-width:var(--camera-tile-max-width-wide)] ${isMultiMonitoringPresentation ? 'gap-2' : 'gap-2 sm:gap-3'}`
          : presentation === 'workspace'
          ? 'grid gap-3 lg:grid-cols-3'
          : 'grid gap-4 lg:grid-cols-2'
      }
      data-presentation={presentation}
      data-focused-source={validFocusedSourceId ?? undefined}
      style={monitoringGridLayout?.style}
    >
      {orderedSources.map((source, sourceIndex) => {
        const accessibleSourceName = sourceLabelPrefix === undefined
          ? source.displayName
          : `${sourceLabelPrefix} ${source.displayName}`;
        const isFocused = source.id === validFocusedSourceId;
        const isDimmed = validFocusedSourceId !== null && !isFocused;
        const cameraTileStyle: CameraTileStyle = {
          viewTransitionName: presentation === 'multi-monitoring'
            ? `camera-tile-${`${robotId}-${source.id}`.replace(/[^a-zA-Z0-9_-]/gu, '-')}`
            : `camera-tile-${String(sourceIndex + 1)}`,
        };
        const fiveSourcePlacementClass = getFiveSourcePlacementClass(
          sourceIndex,
          orderedSources.length,
          isFocused,
        );

        return (
          <div
            aria-hidden={isDimmed || undefined}
            aria-label={`${accessibleSourceName} 영상 영역`}
            className={
            isMonitoringPresentation
                ? `flex min-h-0 origin-center items-center justify-center overflow-hidden transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${fiveSourcePlacementClass} ${isFocused ? presentation === 'multi-monitoring' ? 'fixed inset-2 z-[70] bg-neutral-950 p-2 scale-100 opacity-100' : 'absolute inset-0 z-20 scale-100 opacity-100' : ''} ${isDimmed ? 'pointer-events-none scale-75 opacity-0' : 'scale-100 opacity-100'}`
                : presentation === 'workspace' && source.id === activeSourceId
                ? 'lg:col-span-3'
                : undefined
            }
            data-camera-focus-state={isFocused ? 'focused' : isDimmed ? 'dimmed' : 'default'}
            inert={isDimmed || undefined}
            key={source.id}
            ref={(element) => {
              if (element === null) sourceRegionRefs.current.delete(source.id);
              else sourceRegionRefs.current.set(source.id, element);
            }}
            role="region"
            style={isMonitoringPresentation ? cameraTileStyle : undefined}
            tabIndex={-1}
          >
            <CameraCard
              accessibleSourceName={accessibleSourceName}
              canFocus={orderedSources.length > 1}
              isFocused={isFocused}
              isSelected={source.id === activeSourceId}
              onFocusChange={() => {
                void changeFocusedSource(isFocused ? null : source.id);
              }}
              onSelect={() => {
                shouldFocusSelectionRef.current = true;
                setSelectedSourceId(source.id);
              }}
              {...(onSourceStatusChange === undefined ? {} : { onStatusChange: onSourceStatusChange })}
              port={port}
              presentation={presentation}
              source={source}
            />
          </div>
        );
      })}
      </section>
    </>
  );
}
