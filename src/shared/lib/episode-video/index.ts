export interface RecordingCamera {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly rotation: number;
  readonly stream: MediaStream | null;
}
const sources = new Map<string, Map<string, RecordingCamera>>();

/** 미리보기 연결이 소유한 스트림을 빌린다. 녹화 종료 시 원본 track을 종료하지 않는다. */
export function registerRecordingCamera(sessionId: string, camera: RecordingCamera): () => void {
  const cameras = sources.get(sessionId) ?? new Map<string, RecordingCamera>();
  sources.set(sessionId, cameras);
  cameras.set(camera.id, camera);
  return () => {
    if (cameras.get(camera.id) === camera) cameras.delete(camera.id);
    if (cameras.size === 0) sources.delete(sessionId);
  };
}

export interface VideoRecording {
  readonly cameras: readonly { id: string; label: string; role: string; rotation: number; mimeType: string }[];
  start(upload: (id: string, sequence: number, data: Blob) => Promise<void>): void;
  stop(): Promise<void>;
  dispose(): void;
}

export function prepareEpisodeVideo(sessionId: string): VideoRecording {
  const cameras = [...(sources.get(sessionId)?.values() ?? [])];
  if (cameras.length > 0 && typeof MediaRecorder === 'undefined') throw new Error('이 브라우저는 영상 녹화를 지원하지 않습니다.');
  const entries = cameras.map((camera) => {
    const tracks = camera.stream?.getVideoTracks() ?? [];
    if (!tracks.some((track) => track.readyState === 'live' && !track.muted)) {
      throw new Error(`${camera.label} 영상을 수신한 뒤 녹화를 시작하세요.`);
    }
    const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('지원하는 영상 녹화 형식이 없습니다.');
    return { camera, tracks, recorder: new MediaRecorder(new MediaStream(tracks), { mimeType, videoBitsPerSecond: 2_500_000 }), sequence: 0 };
  });
  let pending = Promise.resolve();
  let queuedBytes = 0;
  let failure: Error | null = null;
  let stopped: Promise<void> | null = null;
  const cleanups: (() => void)[] = [];
  const fail = (error: unknown) => {
    failure ??= error instanceof Error ? error : new Error('카메라 영상 저장에 실패했습니다.');
    entries.forEach(({ recorder }) => { if (recorder.state !== 'inactive') recorder.stop(); });
  };
  const completions = entries.map(({ recorder }) => new Promise<void>((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.addEventListener('error', () => fail(new Error('영상 녹화가 중단되었습니다.')));
  }));
  return {
    cameras: entries.map(({ camera, recorder }) => ({ id: camera.id, label: camera.label, role: camera.role, rotation: camera.rotation, mimeType: recorder.mimeType })),
    start: (upload) => {
      entries.forEach((entry) => {
        const { recorder, camera } = entry;
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size === 0 || failure) return;
          if (queuedBytes + event.data.size > 32 * 1_024 * 1_024) { fail(new Error('영상 전송이 지연되어 녹화를 중단했습니다.')); return; }
          queuedBytes += event.data.size;
          const sequence = entry.sequence++;
          pending = pending.then(async () => {
            if (failure) return;
            for (let attempt = 0; ; attempt += 1) {
              try { await upload(camera.id, sequence, event.data); return; }
              catch (error) { if (attempt === 2) throw error; }
            }
          }).catch(fail).finally(() => { queuedBytes -= event.data.size; });
        });
        entry.tracks.forEach((track) => {
          const ended = () => fail(new Error(`${camera.label} 연결이 녹화 중 끊겼습니다.`));
          track.addEventListener('ended', ended);
          track.addEventListener('mute', ended);
          cleanups.push(() => { track.removeEventListener('ended', ended); track.removeEventListener('mute', ended); });
        });
        try { recorder.start(1_000); } catch (error) { recorder.dispatchEvent(new Event('stop')); fail(error); }
      });
    },
    stop: () => stopped ??= (async () => {
      entries.forEach(({ recorder }) => { if (recorder.state !== 'inactive') recorder.stop(); });
      await Promise.all(completions);
      await pending;
      cleanups.splice(0).forEach((cleanup) => cleanup());
      if (failure) throw failure;
    })(),
    dispose: () => {
      failure ??= new Error('영상 녹화가 종료되었습니다.');
      cleanups.splice(0).forEach((cleanup) => cleanup());
      entries.forEach(({ recorder }) => { if (recorder.state !== 'inactive') recorder.stop(); });
    },
  };
}
