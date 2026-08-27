export interface CompositeGridCrop {
  readonly column: number;
  readonly columns: number;
  readonly row: number;
  readonly rows: number;
}

export interface CroppedVideoOutput {
  readonly mediaStream: MediaStream;
  close(): void;
}

export interface CompositeGridVideoCropper {
  openCrop(crop: CompositeGridCrop): CroppedVideoOutput;
  close(): void;
}

export type CompositeGridVideoCropperFactory = (
  sourceStream: MediaStream,
  signal?: AbortSignal,
) => Promise<CompositeGridVideoCropper>;

interface CropRectangle {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface ActiveCrop {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly crop: CompositeGridCrop;
  readonly track: MediaStreamTrack;
}

interface CompositeGridVideoCropperOptions {
  readonly initializationTimeoutMs?: number;
  readonly signal?: AbortSignal;
}

function createAbortError(): DOMException {
  return new DOMException('합성 카메라 영상 분할이 취소되었습니다.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw createAbortError();
}

function requirePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} 값은 0보다 큰 정수여야 합니다.`);
  }
}

export function calculateCompositeGridCrop(
  sourceWidth: number,
  sourceHeight: number,
  crop: CompositeGridCrop,
): CropRectangle {
  requirePositiveInteger(sourceWidth, '합성 카메라 영상 너비');
  requirePositiveInteger(sourceHeight, '합성 카메라 영상 높이');
  requirePositiveInteger(crop.columns, '합성 카메라 열 수');
  requirePositiveInteger(crop.rows, '합성 카메라 행 수');
  if (!Number.isInteger(crop.column) || crop.column < 0 || crop.column >= crop.columns) {
    throw new Error('합성 카메라 열 위치가 grid 범위를 벗어났습니다.');
  }
  if (!Number.isInteger(crop.row) || crop.row < 0 || crop.row >= crop.rows) {
    throw new Error('합성 카메라 행 위치가 grid 범위를 벗어났습니다.');
  }

  const x = Math.floor(sourceWidth * crop.column / crop.columns);
  const right = Math.floor(sourceWidth * (crop.column + 1) / crop.columns);
  const y = Math.floor(sourceHeight * crop.row / crop.rows);
  const bottom = Math.floor(sourceHeight * (crop.row + 1) / crop.rows);
  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  };
}

function stopTrack(track: MediaStreamTrack): void {
  try {
    track.stop();
  } catch {
    // 하나의 비정상 canvas track이 나머지 분할 영상 정리를 막지 않는다.
  }
}

function waitForVideoMetadata(
  video: HTMLVideoElement,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<void> {
  if (signal?.aborted === true) return Promise.reject(createAbortError());
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', handleMetadata);
      video.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
      if (error === undefined) resolve();
      else reject(error);
    };
    const handleMetadata = (): void => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        finish(new Error('합성 카메라 영상의 해상도를 확인하지 못했습니다.'));
        return;
      }
      finish();
    };
    const handleError = (): void => {
      finish(new Error('합성 카메라 영상을 분할용 video에 연결하지 못했습니다.'));
    };
    const handleAbort = (): void => finish(createAbortError());
    const timeoutId = globalThis.setTimeout(() => {
      finish(new Error('합성 카메라 영상의 해상도를 기다리는 시간이 초과되었습니다.'));
    }, timeoutMs);

    video.addEventListener('loadedmetadata', handleMetadata);
    video.addEventListener('error', handleError);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

class BrowserCompositeGridVideoCropper implements CompositeGridVideoCropper {
  readonly #video: HTMLVideoElement;
  readonly #activeCrops = new Map<number, ActiveCrop>();
  #nextCropId = 0;
  #videoFrameCallbackId: number | null = null;
  #animationFrameId: number | null = null;
  #closed = false;

  constructor(video: HTMLVideoElement) {
    this.#video = video;
  }

  openCrop(crop: CompositeGridCrop): CroppedVideoOutput {
    if (this.#closed) throw new Error('종료된 합성 카메라 분할기는 사용할 수 없습니다.');
    const rectangle = calculateCompositeGridCrop(
      this.#video.videoWidth,
      this.#video.videoHeight,
      crop,
    );
    const canvas = document.createElement('canvas');
    canvas.width = rectangle.width;
    canvas.height = rectangle.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (context === null) {
      throw new Error('합성 카메라 분할용 Canvas 2D context를 만들지 못했습니다.');
    }
    if (typeof canvas.captureStream !== 'function') {
      throw new Error('현재 브라우저가 카메라 영상 분할 출력을 지원하지 않습니다.');
    }
    const mediaStream = canvas.captureStream();
    const track = mediaStream.getVideoTracks()[0];
    if (track === undefined) {
      mediaStream.getTracks().forEach(stopTrack);
      throw new Error('합성 카메라 분할 영상 track을 만들지 못했습니다.');
    }

    const cropId = this.#nextCropId;
    this.#nextCropId += 1;
    const activeCrop = { canvas, context, crop, track } satisfies ActiveCrop;
    this.#activeCrops.set(cropId, activeCrop);
    this.#scheduleFrame();
    let released = false;
    return {
      mediaStream,
      close: () => {
        if (released) return;
        released = true;
        this.#activeCrops.delete(cropId);
        stopTrack(track);
        if (this.#activeCrops.size === 0) this.#cancelScheduledFrame();
      },
    };
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#cancelScheduledFrame();
    [...this.#activeCrops.values()].forEach(({ track }) => stopTrack(track));
    this.#activeCrops.clear();
    try {
      this.#video.pause();
    } catch {
      // 이미 정지한 내부 video의 오류는 무시한다.
    }
    this.#video.srcObject = null;
    this.#video.remove();
  }

  #drawCrop(activeCrop: ActiveCrop): void {
    const rectangle = calculateCompositeGridCrop(
      this.#video.videoWidth,
      this.#video.videoHeight,
      activeCrop.crop,
    );
    activeCrop.context.drawImage(
      this.#video,
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
      0,
      0,
      activeCrop.canvas.width,
      activeCrop.canvas.height,
    );
  }

  #drawFrame = (): void => {
    this.#videoFrameCallbackId = null;
    this.#animationFrameId = null;
    if (this.#closed || this.#activeCrops.size === 0) return;
    this.#activeCrops.forEach((activeCrop) => {
      try {
        this.#drawCrop(activeCrop);
      } catch {
        // 다음 원본 frame에서 다시 그려 일시적인 decode 전환을 흡수한다.
      }
    });
    this.#scheduleFrame();
  };

  #scheduleFrame(): void {
    if (
      this.#closed
      || this.#activeCrops.size === 0
      || this.#videoFrameCallbackId !== null
      || this.#animationFrameId !== null
    ) return;
    if (typeof this.#video.requestVideoFrameCallback === 'function') {
      this.#videoFrameCallbackId = this.#video.requestVideoFrameCallback(this.#drawFrame);
      return;
    }
    this.#animationFrameId = globalThis.requestAnimationFrame(this.#drawFrame);
  }

  #cancelScheduledFrame(): void {
    if (this.#videoFrameCallbackId !== null) {
      this.#video.cancelVideoFrameCallback(this.#videoFrameCallbackId);
      this.#videoFrameCallbackId = null;
    }
    if (this.#animationFrameId !== null) {
      globalThis.cancelAnimationFrame(this.#animationFrameId);
      this.#animationFrameId = null;
    }
  }
}

export async function createCompositeGridVideoCropper(
  sourceStream: MediaStream,
  options: CompositeGridVideoCropperOptions = {},
): Promise<CompositeGridVideoCropper> {
  const timeoutMs = options.initializationTimeoutMs ?? 20_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('합성 카메라 분할 초기화 제한 시간은 0보다 큰 유한한 값이어야 합니다.');
  }
  throwIfAborted(options.signal);
  if (document.body === null) {
    throw new Error('합성 카메라 분할용 video를 연결할 문서가 준비되지 않았습니다.');
  }

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  video.style.position = 'fixed';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.left = '-10000px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  video.srcObject = sourceStream;
  document.body.append(video);

  try {
    await Promise.all([
      waitForVideoMetadata(video, options.signal, timeoutMs),
      video.play(),
    ]);
    throwIfAborted(options.signal);
    return new BrowserCompositeGridVideoCropper(video);
  } catch (error: unknown) {
    try {
      video.pause();
    } catch {
      // 초기화 중 실패한 내부 video는 가능한 범위에서만 정리한다.
    }
    video.srcObject = null;
    video.remove();
    throw error;
  }
}
