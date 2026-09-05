import { useEffect, useState } from 'react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Slider } from '@/shared/ui/slider';
import { Surface } from '@/shared/ui/surface';

const playbackRates = [0.5, 1, 2] as const;

export interface PlaybackBarProps {
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly durationMs: number;
  readonly formatTime: (timeMs: number) => string;
  readonly frameDurationMs?: number;
  readonly label: string;
  readonly onPlayingChange: (playing: boolean) => void;
  readonly onPositionChange: (positionMs: number) => void;
  readonly playing: boolean;
  readonly positionMs: number;
  readonly positionAriaLabel?: string;
  readonly statusLabel?: string | null;
}

export function PlaybackBar({
  ariaLabel = '재생 컨트롤',
  disabled = false,
  durationMs: rawDurationMs,
  formatTime,
  frameDurationMs = 33,
  label,
  onPlayingChange,
  onPositionChange,
  playing,
  positionMs,
  positionAriaLabel = `${ariaLabel} 위치`,
  statusLabel = 'RECORDED',
}: PlaybackBarProps) {
  const durationMs = Math.max(1, rawDurationMs);
  const [playbackRate, setPlaybackRate] = useState<(typeof playbackRates)[number]>(1);

  useEffect(() => {
    if (!playing || disabled) return undefined;
    const timer = window.setTimeout(() => {
      const nextPositionMs = Math.min(durationMs, positionMs + 250 * playbackRate);
      onPositionChange(nextPositionMs);
      if (nextPositionMs >= durationMs) onPlayingChange(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [disabled, durationMs, onPlayingChange, onPositionChange, playbackRate, playing, positionMs]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.code !== 'Space' || event.defaultPrevented || disabled
        || event.repeat || event.altKey || event.ctrlKey || event.metaKey
      ) return;
      const target = event.target;
      if (
        target instanceof Element && target.closest(
          'input, textarea, select, button, a, summary, audio, video, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="textbox"], [role="slider"], [role="combobox"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]',
        ) !== null
      ) return;
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]') !== null) return;
      event.preventDefault();
      if (playing) {
        onPlayingChange(false);
        return;
      }
      if (positionMs >= durationMs) onPositionChange(0);
      onPlayingChange(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, durationMs, onPlayingChange, onPositionChange, playing, positionMs]);

  const play = (): void => {
    if (positionMs >= durationMs) onPositionChange(0);
    onPlayingChange(true);
  };

  const stepFrame = (direction: -1 | 1): void => {
    onPlayingChange(false);
    onPositionChange(Math.min(
      durationMs,
      Math.max(0, positionMs + direction * frameDurationMs),
    ));
  };

  const cyclePlaybackRate = (): void => {
    setPlaybackRate((currentRate) => {
      const currentIndex = playbackRates.indexOf(currentRate);
      return playbackRates[(currentIndex + 1) % playbackRates.length] ?? 1;
    });
  };

  return (
    <Surface
      aria-label={ariaLabel}
      as="div"
      className="grid grid-cols-[auto_minmax(8rem,1fr)_auto_auto] items-center gap-3 px-3 py-2 max-md:grid-cols-[auto_minmax(6rem,1fr)_auto]"
      density="compact"
      layer="soft-group"
      role="group"
    >
      <div className="flex min-w-0 items-center gap-2 max-md:col-span-3">
        {statusLabel === null ? null : <Badge tone="info">{statusLabel}</Badge>}
        <strong className="truncate text-xs">{label}</strong>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <span className="min-w-10 text-right text-xs font-semibold tabular-nums text-foreground">
          {formatTime(positionMs)}
        </span>
        <Slider
          aria-label={positionAriaLabel}
          aria-valuetext={`${formatTime(positionMs)} / ${formatTime(durationMs)}`}
          disabled={disabled}
          max={durationMs}
          min={0}
          onChange={(event) => {
            onPlayingChange(false);
            onPositionChange(Number(event.currentTarget.value));
          }}
          step={1}
          value={positionMs}
          valueLabel={formatTime(positionMs)}
        />
        <span className="min-w-10 text-xs font-semibold tabular-nums text-muted">
          {formatTime(durationMs)}
        </span>
      </div>

      <span aria-live="polite" className="sr-only" role="status">
        {playing ? '재생 중' : '일시 정지됨'}
      </span>

      <div className="flex items-center justify-center gap-1">
        <Button
          aria-label="이전 프레임"
          className="px-2 text-xs"
          disabled={disabled}
          onClick={() => stepFrame(-1)}
          title="이전 프레임"
          variant="ghost"
        >
          −1f
        </Button>
        <Button
          aria-label={playing ? '일시정지' : '재생'}
          aria-pressed={playing}
          className="size-[var(--layout-control-height)] min-h-0 rounded-[var(--design-radius-round)] p-0"
          disabled={disabled}
          onClick={() => {
            if (playing) onPlayingChange(false);
            else play();
          }}
          title={playing ? '일시정지' : '재생'}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </Button>
        <Button
          aria-label="다음 프레임"
          className="px-2 text-xs"
          disabled={disabled}
          onClick={() => stepFrame(1)}
          title="다음 프레임"
          variant="ghost"
        >
          +1f
        </Button>
      </div>

      <Button
        aria-label={`재생 속도 ${String(playbackRate)}배`}
        className="px-2 text-xs"
        disabled={disabled}
        onClick={cyclePlaybackRate}
        title="재생 속도 변경"
        variant="ghost"
      >
        {String(playbackRate)}×
      </Button>
    </Surface>
  );
}
