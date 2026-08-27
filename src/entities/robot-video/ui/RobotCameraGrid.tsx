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

import { useRobotVideoPort } from '../model/robot-video-context';
import type {
  RobotVideoPort,
  RobotVideoRecordingCapability,
  RobotVideoRecordingSession,
  RobotVideoSource,
  VideoConnectionStatus,
} from '../model/robot-video';

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

function VideoSurface({
  onAspectRatioChange,
  presentation,
  stream,
  label,
}: {
  readonly onAspectRatioChange?: (width: number, height: number) => void;
  readonly presentation: 'default' | 'compact' | 'monitoring';
  readonly stream: MediaStream;
  readonly label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

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
  );
}

function CameraCard({
  canFocus,
  isFocused,
  isSelected,
  onFocusChange,
  onSelect,
  port,
  presentation,
  source,
}: {
  readonly canFocus: boolean;
  readonly isFocused: boolean;
  readonly isSelected: boolean;
  readonly onFocusChange: () => void;
  readonly onSelect: () => void;
  readonly port: RobotVideoPort;
  readonly presentation: 'grid' | 'monitoring' | 'workspace';
  readonly source: RobotVideoSource;
}) {
  const [retrySequence, setRetrySequence] = useState(0);
  const [status, setStatus] =
    useState<VideoConnectionStatus>('connecting');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>(
    defaultVideoAspectRatio,
  );
  const hasConnectionProblem = status === 'error' || status === 'disconnected';
  const isPending = status === 'connecting' || status === 'reconnecting';
  const problemMessage = hasConnectionProblem
    ? getConnectionProblemMessage(status)
    : null;

  const statusAnnouncement = `${source.displayName}: ${
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

  if (presentation === 'monitoring') {
    const pendingLabel = status === 'reconnecting' || retrySequence > 0
      ? cameraCopy.reconnecting
      : cameraCopy.loading;
    const maxTileHeight = isFocused
      ? '100cqh'
      : 'var(--camera-tile-max-height)';
    const maxTileWidth = isFocused
      ? '100cqw'
      : 'var(--camera-tile-max-width)';
    const videoTileStyle: VideoTileStyle = {
      aspectRatio: videoAspectRatio.cssValue,
      height: `min(${maxTileHeight}, calc(${maxTileWidth} / ${String(videoAspectRatio.numericValue)}))`,
      width: `min(${maxTileWidth}, calc(${maxTileHeight} * ${String(videoAspectRatio.numericValue)}))`,
    };

    return (
      <div
        className="group relative max-h-full max-w-full overflow-hidden rounded-lg bg-neutral-950 ring-1 ring-white/15"
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
            label={`${source.displayName} 영상`}
            onAspectRatioChange={updateVideoAspectRatio}
            presentation="monitoring"
            stream={stream}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex min-w-0 items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 pb-8">
          <h2 className="truncate text-sm font-semibold text-white">
            {source.displayName}
          </h2>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            {canFocus && (stream !== null || isFocused) ? (
              <Button
                aria-label={isFocused
                  ? `${source.displayName} 확대 보기 종료`
                  : `${source.displayName} 확대 보기`}
                aria-pressed={isFocused}
                className="size-10 min-h-10 border-white/25 bg-black/55 p-0 text-white opacity-0 shadow-sm backdrop-blur-sm transition-[opacity,transform,background-color] duration-200 group-hover:opacity-100 group-focus-within:opacity-100 hover:scale-105 hover:bg-black/75 active:scale-95 aria-pressed:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
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
                  className="justify-self-center"
                  onClick={() => {
                    setStatus('connecting');
                    setStream(null);
                    setVideoAspectRatio(defaultVideoAspectRatio);
                    setRetrySequence((value) => value + 1);
                  }}
                  variant="secondary"
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
          label={`${source.displayName} 영상`}
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
  readonly presentation?: 'grid' | 'monitoring' | 'workspace';
  readonly recordingEnabled?: boolean;
  readonly robotId: string;
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
      <p className="text-sm text-neutral-600">
        논리 카메라를 선택하면 원본 영상을 기록합니다.
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

function getMonitoringGridLayout(sourceCount: number): MonitoringGridLayout {
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
        8,
      ),
      '--camera-tile-max-height-wide': getTileTrackSize('cqh', wideRows, 12),
      '--camera-tile-max-width-compact': getTileTrackSize(
        'cqw',
        compactColumns,
        8,
      ),
      '--camera-tile-max-width-wide': getTileTrackSize(
        'cqw',
        wideLogicalColumns,
        12,
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
  presentation = 'grid',
  recordingEnabled = false,
  robotId,
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
  const focusedSourceId = focusedCamera?.contextKey === focusContextKey
    ? focusedCamera.sourceId
    : null;
  const sourceRegionRefs = useRef(new Map<string, HTMLDivElement>());
  const shouldFocusSelectionRef = useRef(false);

  useEffect(() => {
    if (!shouldFocusSelectionRef.current || selectedSourceId === null) return;
    shouldFocusSelectionRef.current = false;
    sourceRegionRefs.current.get(selectedSourceId)?.focus();
  }, [selectedSourceId]);

  const changeFocusedSource = useCallback((sourceId: string | null) => {
    return updateCameraLayout(() => {
      setFocusedCamera(sourceId === null
        ? null
        : { contextKey: focusContextKey, sourceId });
    });
  }, [focusContextKey]);

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
  const monitoringGridLayout = presentation === 'monitoring'
    ? getMonitoringGridLayout(orderedSources.length)
    : undefined;
  const validFocusedSourceId = presentation === 'monitoring'
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
        presentation === 'monitoring'
          ? 'relative grid h-full min-h-0 w-full place-content-center grid-cols-[repeat(var(--camera-columns-compact),max-content)] grid-rows-[repeat(var(--camera-rows-compact),max-content)] gap-2 overflow-hidden [--camera-tile-max-height:var(--camera-tile-max-height-compact)] [--camera-tile-max-width:var(--camera-tile-max-width-compact)] sm:grid-cols-[repeat(var(--camera-columns-wide),max-content)] sm:grid-rows-[repeat(var(--camera-rows-wide),max-content)] sm:gap-3 sm:[--camera-tile-max-height:var(--camera-tile-max-height-wide)] sm:[--camera-tile-max-width:var(--camera-tile-max-width-wide)]'
          : presentation === 'workspace'
          ? 'grid gap-3 lg:grid-cols-3'
          : 'grid gap-4 lg:grid-cols-2'
      }
      data-presentation={presentation}
      data-focused-source={validFocusedSourceId ?? undefined}
      style={monitoringGridLayout?.style}
    >
      {orderedSources.map((source, sourceIndex) => {
        const isFocused = source.id === validFocusedSourceId;
        const isDimmed = validFocusedSourceId !== null && !isFocused;
        const cameraTileStyle: CameraTileStyle = {
          viewTransitionName: `camera-tile-${String(sourceIndex + 1)}`,
        };
        const fiveSourcePlacementClass = getFiveSourcePlacementClass(
          sourceIndex,
          orderedSources.length,
          isFocused,
        );

        return (
          <div
            aria-hidden={isDimmed || undefined}
            aria-label={`${source.displayName} 영상 영역`}
            className={
            presentation === 'monitoring'
                ? `flex min-h-0 origin-center items-center justify-center overflow-hidden transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${fiveSourcePlacementClass} ${isFocused ? 'absolute inset-0 z-20 scale-100 opacity-100' : ''} ${isDimmed ? 'pointer-events-none scale-75 opacity-0' : 'scale-100 opacity-100'}`
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
            style={presentation === 'monitoring' ? cameraTileStyle : undefined}
            tabIndex={-1}
          >
            <CameraCard
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
