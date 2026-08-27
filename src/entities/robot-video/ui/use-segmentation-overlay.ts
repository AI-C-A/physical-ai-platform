import { useEffect, useState, type RefObject } from 'react';

import { requestQueuedSegmentationOverlay } from '../api/segmentation-batch-queue';
import type { SegmentationLabel } from '../api/segmentation-client';

const unavailableFrameRetryMs = 200;
const captureWidth = 512;
const maximumSegmentationFps = 30;
const minimumFramePeriodMs = 1_000 / maximumSegmentationFps;
const metricsRefreshPeriodMs = 250;
const maximumOverlayAgeMs = 750;
const maximumRetryDelayMs = 5_000;

interface SegmentationMetrics {
  readonly framesPerSecond: number;
  readonly latencyMs: number;
}

interface SegmentationOverlayState {
  readonly labels: readonly SegmentationLabel[];
  readonly metrics: SegmentationMetrics | null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.72);
  });
}

/**
 * 최신 video frame 하나씩만 segmentation queue에 보내고, 새 overlay가 오면 이전 URL을 폐기한다.
 * 비활성화되거나 component가 unmount되면 대기 중인 요청과 timer, Object URL을 모두 정리한다.
 */
export function useSegmentationOverlay({
  enabled,
  overlayRef,
  videoRef,
}: {
  readonly enabled: boolean;
  readonly overlayRef: RefObject<HTMLImageElement | null>;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
}): SegmentationOverlayState {
  const [labels, setLabels] = useState<readonly SegmentationLabel[]>([]);
  const [metrics, setMetrics] = useState<SegmentationMetrics | null>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!enabled || overlay === null) {
      if (overlay !== null) overlay.removeAttribute('src');
      setLabels([]);
      setMetrics(null);
      return;
    }

    const canvas = document.createElement('canvas');
    let active = true;
    let controller: AbortController | null = null;
    let context: CanvasRenderingContext2D | null = null;
    let currentOverlayUrl: string | null = null;
    let lastCompletionAt: number | null = null;
    let lastMetricsRefreshAt = Number.NEGATIVE_INFINITY;
    let retryCount = 0;
    let smoothedFramesPerSecond = 0;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearOverlay = (): void => {
      overlay.removeAttribute('src');
      if (currentOverlayUrl !== null) URL.revokeObjectURL(currentOverlayUrl);
      currentOverlayUrl = null;
    };
    const schedule = (delayMs: number): void => {
      if (!active) return;
      timer = setTimeout(() => void capture(), delayMs);
    };
    const capture = async (): Promise<void> => {
      const video = videoRef.current;
      if (
        video === null
        || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        || video.videoWidth <= 0
        || video.videoHeight <= 0
      ) {
        schedule(unavailableFrameRetryMs);
        return;
      }

      context ??= canvas.getContext('2d', { alpha: false });
      if (context === null) {
        schedule(maximumRetryDelayMs);
        return;
      }

      const cycleStartedAt = performance.now();
      canvas.width = Math.min(captureWidth, video.videoWidth);
      canvas.height = Math.max(
        1,
        Math.round(canvas.width * video.videoHeight / video.videoWidth),
      );
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frame = await canvasToJpeg(canvas);
      if (!active || frame === null) {
        schedule(unavailableFrameRetryMs);
        return;
      }

      controller = new AbortController();
      try {
        const result = await requestQueuedSegmentationOverlay(frame, controller.signal);
        if (!active) return;

        const nextOverlayUrl = URL.createObjectURL(result.overlay);
        const previousOverlayUrl = currentOverlayUrl;
        currentOverlayUrl = nextOverlayUrl;
        overlay.src = nextOverlayUrl;
        if (previousOverlayUrl !== null) URL.revokeObjectURL(previousOverlayUrl);
        setLabels(result.labels);
        retryCount = 0;

        if (staleTimer !== null) clearTimeout(staleTimer);
        staleTimer = setTimeout(() => {
          clearOverlay();
          if (active) setLabels([]);
        }, maximumOverlayAgeMs);
        const completedAt = performance.now();
        const cycleElapsedMs = completedAt - cycleStartedAt;
        const currentFramesPerSecond = lastCompletionAt === null
          ? 1_000 / Math.max(minimumFramePeriodMs, cycleElapsedMs)
          : 1_000 / Math.max(1, completedAt - lastCompletionAt);
        smoothedFramesPerSecond = smoothedFramesPerSecond === 0
          ? currentFramesPerSecond
          : (smoothedFramesPerSecond * 0.75) + (currentFramesPerSecond * 0.25);
        lastCompletionAt = completedAt;

        if (completedAt - lastMetricsRefreshAt >= metricsRefreshPeriodMs) {
          lastMetricsRefreshAt = completedAt;
          setMetrics({
            framesPerSecond: Math.min(maximumSegmentationFps, smoothedFramesPerSecond),
            latencyMs: cycleElapsedMs,
          });
        }

        // 30 FPS보다 빨라지지만 않게 제한한다. 추론이 느리면 추가 대기 없이
        // 완료 시점의 최신 프레임을 처리해 GPU 처리량에 자연스럽게 맞춘다.
        schedule(Math.max(0, minimumFramePeriodMs - cycleElapsedMs));
      } catch (error: unknown) {
        if (!active || isAbortError(error)) return;
        retryCount += 1;
        const retryDelayMs = Math.min(
          maximumRetryDelayMs,
          unavailableFrameRetryMs * 2 ** retryCount,
        );
        schedule(retryDelayMs);
      } finally {
        controller = null;
      }
    };

    schedule(0);
    return () => {
      active = false;
      controller?.abort();
      if (timer !== null) clearTimeout(timer);
      if (staleTimer !== null) clearTimeout(staleTimer);
      clearOverlay();
    };
  }, [enabled, overlayRef, videoRef]);

  return { labels, metrics };
}
