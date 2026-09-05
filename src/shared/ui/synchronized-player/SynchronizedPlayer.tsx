import { useEffect, useRef, useState } from 'react';

import './synchronized-player.css';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Surface } from '@/shared/ui/surface';
import { FittedMedia } from '@/shared/ui/media-panel';

import { SynchronizedMedia } from './SynchronizedMedia';

export interface SynchronizedPlayerSource {
  readonly id: string;
  readonly imageSrc?: string;
  readonly label: string;
  readonly meta?: string;
  readonly overlay?: 'full-body-skeleton';
  readonly poster?: string;
  readonly renderMode?: 'rgb' | 'depth';
  readonly src: string;
  readonly status?: 'live' | 'idle' | 'offline' | 'recorded';
}

const fullBodyKeypoints = [
  { id: 'nose', x: 50, y: 7.3 },
  { id: 'left-eye', x: 49.2, y: 6.8 },
  { id: 'right-eye', x: 50.8, y: 6.8 },
  { id: 'left-ear', x: 47.9, y: 7.5 },
  { id: 'right-ear', x: 52.1, y: 7.5 },
  { id: 'left-shoulder', x: 42.4, y: 13.3 },
  { id: 'right-shoulder', x: 57.6, y: 13.3 },
  { id: 'left-elbow', x: 37.3, y: 21.8 },
  { id: 'right-elbow', x: 62.7, y: 21.8 },
  { id: 'left-wrist', x: 33.8, y: 27 },
  { id: 'right-wrist', x: 66.2, y: 27 },
  { id: 'left-hip', x: 46.8, y: 29.3 },
  { id: 'right-hip', x: 53.2, y: 29.3 },
  { id: 'left-knee', x: 46.2, y: 39.2 },
  { id: 'right-knee', x: 53.8, y: 39.2 },
  { id: 'left-ankle', x: 45.5, y: 51.2 },
  { id: 'right-ankle', x: 54.5, y: 51.2 },
] as const;

const fullBodyBones = [
  ['left-ear', 'left-eye'],
  ['left-eye', 'nose'],
  ['nose', 'right-eye'],
  ['right-eye', 'right-ear'],
  ['left-shoulder', 'right-shoulder'],
  ['left-shoulder', 'left-elbow'],
  ['left-elbow', 'left-wrist'],
  ['right-shoulder', 'right-elbow'],
  ['right-elbow', 'right-wrist'],
  ['left-shoulder', 'left-hip'],
  ['right-shoulder', 'right-hip'],
  ['left-hip', 'right-hip'],
  ['left-hip', 'left-knee'],
  ['left-knee', 'left-ankle'],
  ['right-hip', 'right-knee'],
  ['right-knee', 'right-ankle'],
] as const;

const fullBodyKeypointsById = new Map(
  fullBodyKeypoints.map((keypoint) => [keypoint.id, keypoint]),
);

function FullBodySkeletonOverlay({
  status = 'idle',
}: {
  readonly status: SynchronizedPlayerSource['status'];
}) {
  const tracking = status === 'live' || status === 'recorded';
  return (
    <div
      aria-label={`전신 스켈레톤 인식 · 관절 ${String(fullBodyKeypoints.length)}개 · ${tracking ? '추적 중' : '대기'}`}
      className="pointer-events-none absolute inset-0 z-[5]"
      data-full-body-skeleton="true"
      role="img"
    >
      <svg
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full ${tracking ? 'opacity-100' : 'opacity-55'}`}
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 100 56.25"
      >
        <rect
          className="fill-none stroke-positive"
          height="49"
          rx="1"
          strokeDasharray="1.2 0.8"
          strokeWidth="0.25"
          width="38"
          x="31"
          y="4"
        />
        <g className="stroke-positive" fill="none" strokeLinecap="round" strokeWidth="0.55">
          {fullBodyBones.map(([fromId, toId]) => {
            const from = fullBodyKeypointsById.get(fromId);
            const to = fullBodyKeypointsById.get(toId);
            if (from === undefined || to === undefined) return null;
            return (
              <line
                key={`${fromId}-${toId}`}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
              />
            );
          })}
        </g>
        <g className="fill-positive stroke-media-scrim" strokeWidth="0.18">
          {fullBodyKeypoints.map((keypoint) => (
            <circle cx={keypoint.x} cy={keypoint.y} key={keypoint.id} r="0.72" />
          ))}
        </g>
      </svg>
    </div>
  );
}

interface SynchronizedPlayerProps {
  readonly layout?: 'auto' | 'featured';
  readonly presentation?: 'default' | 'monitoring';
  readonly sources: readonly SynchronizedPlayerSource[];
  readonly title?: string;
}

function getSourceStatusLabel(status: NonNullable<SynchronizedPlayerSource['status']>): string {
  if (status === 'live') return '실시간';
  if (status === 'recorded') return '기록';
  if (status === 'offline') return '오프라인';
  return '대기';
}

function getSourceStatusAriaLabel(status: NonNullable<SynchronizedPlayerSource['status']>): string {
  if (status === 'live') return '실시간 연결';
  if (status === 'recorded') return '기록 영상';
  if (status === 'offline') return '연결 끊김';
  return '대기';
}

function getSourceStatusDotClassName(status: NonNullable<SynchronizedPlayerSource['status']>): string {
  if (status === 'live') return 'bg-positive';
  if (status === 'recorded') return 'bg-action-primary';
  if (status === 'offline') return 'bg-negative';
  return 'bg-muted';
}

export function SynchronizedPlayer({
  layout = 'auto',
  presentation = 'default',
  sources,
  title = '동기화 멀티뷰',
}: SynchronizedPlayerProps) {
  const refs = useRef(new Map<string, HTMLVideoElement>());
  const playbackRequestRef = useRef(0);
  const [playbackPending, setPlaybackPending] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const hasVideoSources = sources.some((source) => source.imageSrc === undefined);
  const usesConstrainedMonitoringLayout = presentation === 'monitoring'
    && layout === 'featured';

  useEffect(() => () => { playbackRequestRef.current += 1; }, []);

  async function playAll(): Promise<void> {
    const request = ++playbackRequestRef.current;
    const videos = [...refs.current.values()];
    setPlaybackPending(true);
    setPlaybackError(false);
    const results = await Promise.allSettled(
      videos.map(async (video) => { await video.play(); }),
    );
    if (request !== playbackRequestRef.current) return;
    setPlaybackPending(false);
    if (results.some((result) => result.status === 'rejected')) {
      videos.forEach((video) => video.pause());
      setPlaybackError(true);
    }
  }

  function pauseAll(): void {
    playbackRequestRef.current += 1;
    setPlaybackPending(false);
    refs.current.forEach((video) => video.pause());
  }

  return (
    <section
      aria-label={title}
      className={presentation === 'monitoring'
        ? 'h-full min-h-0'
        : 'grid gap-3'}
      data-presentation={presentation}
    >
      {presentation === 'default' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <strong>{title}</strong>
          {hasVideoSources ? (
            <div className="flex gap-2">
              <Button isLoading={playbackPending} onClick={() => { void playAll(); }} variant="secondary"><Icon name="play" />전체 재생</Button>
              <Button onClick={pauseAll} variant="secondary"><Icon name="stop" />전체 정지</Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {playbackError ? (
        <p className="text-sm text-negative" role="alert">
          영상을 재생할 수 없습니다. 파일이나 연결 상태를 확인한 후 전체 재생을 다시 누르세요.
        </p>
      ) : null}
      {sources.length === 0 ? (
        <p className="py-6 text-sm text-muted" role="status">연결된 영상 소스가 없습니다. 장치 연결 상태를 확인하세요.</p>
      ) : null}
      <div className={usesConstrainedMonitoringLayout
        ? 'flex h-full min-h-0 w-full items-center justify-center overflow-hidden [container-type:size]'
        : layout === 'featured'
          ? 'grid gap-3 sm:grid-cols-2'
        : sources.length > 2
          ? 'grid gap-3 lg:grid-cols-3'
          : 'grid gap-3 md:grid-cols-2'}>
        <div
          className={usesConstrainedMonitoringLayout
            ? `grid h-full min-h-0 w-full auto-rows-fr gap-2 ${sources.length >= 3 ? 'grid-cols-2' : 'grid-cols-1'}`
            : 'contents'}
          data-camera-card-layout={usesConstrainedMonitoringLayout ? 'aspect-video' : undefined}
          data-camera-source-count={sources.length}
        >
          {sources.map((source, index) => (
            <FittedMedia
              className={layout === 'featured' && index === 0 ? presentation === 'monitoring' ? sources.length >= 3 ? 'col-span-2' : '' : 'sm:col-span-2' : ''}
              constrained={usesConstrainedMonitoringLayout}
              key={source.id}
            >
              <Surface
                as="figure"
                className="grid min-w-0 grid-cols-1 overflow-hidden p-0"
                layer="canvas"
              >
                <figcaption className="flex min-h-[var(--layout-control-height)] flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-layer-raised px-3 py-2 text-xs text-foreground">
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {source.status === undefined ? null : (
                      <span
                        aria-label={getSourceStatusAriaLabel(source.status)}
                        className={`size-2 shrink-0 rounded-full ${getSourceStatusDotClassName(source.status)}`}
                        role="status"
                      />
                    )}
                    <span className="truncate" title={source.label}>{source.label}</span>
                    {source.status === undefined ? null : (
                      <span className="shrink-0 text-xs font-semibold text-muted">
                        {getSourceStatusLabel(source.status)}
                      </span>
                    )}
                  </span>
                  {source.meta === undefined ? null : (
                    <span className="text-xs tabular-nums text-muted">{source.meta}</span>
                  )}
                  {source.overlay === 'full-body-skeleton'
                    && (source.status === 'live' || source.status === 'recorded') ? (
                    <span className="text-xs font-semibold text-positive">전신 관절 · 17/17</span>
                  ) : null}
                </figcaption>
                <div className="min-h-0 min-w-0">
                  <div
                    className="relative aspect-video w-full overflow-hidden"
                    data-aspect-media-viewport
                    data-camera-viewport="true"
                  >
                    {presentation === 'monitoring'
                      && (source.status === 'idle' || source.status === 'offline') ? (
                      <div className="absolute inset-0 grid place-items-center bg-media-background text-center">
                        <div className="grid justify-items-center gap-2 px-4 text-media-foreground-muted">
                          <Icon name={source.status === 'offline' ? 'wifi-off' : 'radio'} size="md" />
                          <span className="text-sm font-semibold text-media-foreground-muted">
                            {source.status === 'offline' ? '소스 연결이 끊겼습니다' : '소스 입력 대기 중'}
                          </span>
                          <span className="text-xs">
                            {source.status === 'offline' ? '연결 및 전원 상태를 확인하세요.' : '녹화가 시작되면 실시간 영상이 표시됩니다.'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <SynchronizedMedia
                        key={`${source.id}:${source.src}:${source.imageSrc ?? ''}`}
                        monitoring={presentation === 'monitoring'}
                        source={source}
                        videoRef={(element) => {
                          if (element === null) refs.current.delete(source.id);
                          else refs.current.set(source.id, element);
                        }}
                      >
                        {source.overlay === 'full-body-skeleton'
                          && (source.status === 'live' || source.status === 'recorded') ? (
                          <FullBodySkeletonOverlay status={source.status} />
                        ) : null}
                      </SynchronizedMedia>
                    )}
                  </div>
                </div>
              </Surface>
            </FittedMedia>
          ))}
        </div>
      </div>
    </section>
  );
}
