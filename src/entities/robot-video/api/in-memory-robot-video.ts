import type {
  RobotVideoPort,
  RobotVideoSession,
  RobotVideoSource,
  VideoConnectionStatus,
} from '../model/robot-video';

interface GeneratedStream {
  readonly stream: MediaStream;
  readonly stop: () => void;
}

type StreamFactory = (
  source: RobotVideoSource,
) => GeneratedStream | Promise<GeneratedStream>;

type CapturableVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

const CAMERA_VIDEO_URL = '/assets/low-altitude-first-person-pov.mp4';

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new DOMException('카메라 연결이 취소되었습니다.', 'AbortError');
  }
}

function stopTracks(stream: MediaStream): void {
  let tracks: readonly MediaStreamTrack[];
  try {
    tracks = stream.getTracks();
  } catch {
    return;
  }
  tracks.forEach((track) => {
    try {
      track.stop();
    } catch {
      // 하나의 비정상 track이 나머지 MediaStream 정리를 막지 않는다.
    }
  });
}

function releaseVideo(video: HTMLVideoElement): void {
  try {
    video.pause();
  } catch {
    // 비정상 media 구현에서도 source와 track 정리를 계속한다.
  }
  video.removeAttribute('src');
  try {
    video.load();
  } catch {
    // unload 실패가 MediaStream track 정리를 막지 않는다.
  }
}

async function createVideoStream(source: RobotVideoSource): Promise<GeneratedStream> {
  const video = document.createElement('video') as CapturableVideoElement;
  const captureStream = video.captureStream ?? video.mozCaptureStream;
  if (captureStream === undefined) {
    throw new Error(`${source.displayName} 영상을 생성할 수 없는 브라우저 환경입니다.`);
  }
  video.src = CAMERA_VIDEO_URL;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    await video.play();
    const stream = captureStream.call(video);
    return {
      stream,
      stop: () => {
        try {
          releaseVideo(video);
        } finally {
          stopTracks(stream);
        }
      },
    };
  } catch (error: unknown) {
    releaseVideo(video);
    throw error;
  }
}

class InMemoryVideoSession implements RobotVideoSession {
  readonly mediaStream: MediaStream;
  readonly #stopStream: () => void;
  readonly #onClose: (session: InMemoryVideoSession) => void;
  readonly #listeners = new Set<(status: VideoConnectionStatus) => void>();
  #status: VideoConnectionStatus = 'connected';

  constructor(
    generated: GeneratedStream,
    onClose: (session: InMemoryVideoSession) => void,
  ) {
    this.mediaStream = generated.stream;
    this.#stopStream = generated.stop;
    this.#onClose = onClose;
  }

  subscribeStatus(listener: (status: VideoConnectionStatus) => void): () => void {
    this.#listeners.add(listener);
    try {
      listener(this.#status);
    } catch (error: unknown) {
      this.#listeners.delete(listener);
      throw error;
    }
    return () => this.#listeners.delete(listener);
  }

  close(): void {
    if (this.#status === 'disconnected') return;
    this.#status = 'disconnected';
    try {
      this.#stopStream();
    } catch {
      // 잘못된 stream 구현도 다른 session과 listener 정리를 막지 않는다.
    }
    [...this.#listeners].forEach((listener) => {
      try {
        listener(this.#status);
      } catch {
        // 한 listener의 오류가 session 소유권 해제를 막지 않는다.
      }
    });
    this.#listeners.clear();
    this.#onClose(this);
  }
}

export class InMemoryRobotVideoAdapter implements RobotVideoPort {
  readonly #sources: readonly RobotVideoSource[];
  readonly #streamFactory: StreamFactory;
  readonly #sessions = new Set<InMemoryVideoSession>();
  #disposed = false;

  constructor(robotIds: readonly string[], streamFactory: StreamFactory = createVideoStream) {
    this.#sources = robotIds.flatMap((robotId, robotIndex) => [
      { id: `${robotId}-camera-front`, robotId, displayName: '전방 카메라' },
      ...(robotIndex % 2 === 0
        ? [{ id: `${robotId}-camera-rear`, robotId, displayName: '후방 카메라' }]
        : []),
    ]);
    this.#streamFactory = streamFactory;
  }

  listSources(robotId: string): Promise<readonly RobotVideoSource[]> {
    if (this.#disposed) {
      return Promise.reject(
        new Error('종료된 Video Adapter는 사용할 수 없습니다.'),
      );
    }
    return Promise.resolve(this.#sources.filter((source) => source.robotId === robotId));
  }

  async openSource(sourceId: string, signal?: AbortSignal): Promise<RobotVideoSession> {
    this.#assertActive();
    throwIfAborted(signal);
    await Promise.resolve();
    this.#assertActive();
    throwIfAborted(signal);
    const source = this.#sources.find((candidate) => candidate.id === sourceId);
    if (source === undefined) {
      throw new Error(`카메라 소스를 찾을 수 없습니다: ${sourceId}`);
    }
    const generated = await this.#streamFactory(source);
    try {
      this.#assertActive();
      throwIfAborted(signal);
    } catch (error: unknown) {
      generated.stop();
      throw error;
    }
    const session = new InMemoryVideoSession(generated, (closedSession) => {
      this.#sessions.delete(closedSession);
    });
    this.#sessions.add(session);
    return session;
  }

  /** Composition Root가 소유한 열린 MediaStream을 애플리케이션 종료 시 함께 닫는다. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    [...this.#sessions].forEach((session) => session.close());
    this.#sessions.clear();
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('종료된 Video Adapter는 사용할 수 없습니다.');
    }
  }
}
