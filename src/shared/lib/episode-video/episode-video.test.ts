import { afterEach, expect, it, vi } from 'vitest';
import { prepareEpisodeVideo, registerRecordingCamera } from './index';

class Recorder extends EventTarget {
  static isTypeSupported() { return true; }
  static instances: Recorder[] = [];
  state = 'inactive';
  mimeType = 'video/webm';
  constructor() { super(); Recorder.instances.push(this); }
  start() { this.state = 'recording'; }
  chunk(text: string) { this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob([text]) })); }
  stop() { this.state = 'inactive'; this.chunk('tail'); this.dispatchEvent(new Event('stop')); }
}
const cleanup: (() => void)[] = [];
function camera() {
  const track = Object.assign(new EventTarget(), { readyState: 'live', muted: false, stop: vi.fn() });
  const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
  cleanup.push(registerRecordingCamera('session', { id: 'head', label: '헤드', role: 'head', rotation: 0, stream }));
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('MediaStream', class {});
  return track;
}
afterEach(() => { cleanup.splice(0).forEach((remove) => remove()); Recorder.instances = []; vi.unstubAllGlobals(); });

it('영상 조각을 순서대로 저장하고 마지막 조각까지 기다린다', async () => {
  const track = camera();
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const upload = vi.fn().mockImplementationOnce(() => barrier).mockResolvedValue(undefined);
  const recording = prepareEpisodeVideo('session');
  recording.start(upload);
  Recorder.instances[0]!.chunk('first');
  const stopped = recording.stop();
  await Promise.resolve();
  expect(upload).toHaveBeenCalledTimes(1);
  release!();
  await stopped;
  expect(upload).toHaveBeenNthCalledWith(1, 'head', 0, expect.any(Blob));
  expect(upload).toHaveBeenNthCalledWith(2, 'head', 1, expect.any(Blob));
  expect(track.stop).not.toHaveBeenCalled();
});

it('전송 실패를 완료로 처리하지 않고 재시도 후 오류를 반환한다', async () => {
  camera();
  const upload = vi.fn().mockRejectedValue(new Error('서버 저장 실패'));
  const recording = prepareEpisodeVideo('session');
  recording.start(upload);
  await expect(recording.stop()).rejects.toThrow('서버 저장 실패');
  expect(upload).toHaveBeenCalledTimes(3);
});

it('연결된 카메라의 영상 수신이 없으면 에피소드를 시작하지 않는다', () => {
  vi.stubGlobal('MediaRecorder', Recorder);
  cleanup.push(registerRecordingCamera('session', { id: 'head', label: '헤드', role: 'head', rotation: 0, stream: null }));
  expect(() => prepareEpisodeVideo('session')).toThrow('영상을 수신한 뒤');
});

it('녹화 중 장치 연결이 끊기면 저장 실패를 반환한다', async () => {
  const track = camera();
  const recording = prepareEpisodeVideo('session');
  recording.start(vi.fn().mockResolvedValue(undefined));
  track.dispatchEvent(new Event('ended'));
  await expect(recording.stop()).rejects.toThrow('연결이 녹화 중 끊겼습니다');
});
