import { afterEach, expect, it, vi } from 'vitest';
import { createHttpQuestFlywheel } from './http-quest-flywheel';

const streams = vi.hoisted(() => [] as { token: string; onSnapshot: (value: unknown) => void; close: ReturnType<typeof vi.fn> }[]);
vi.mock('@/shared/lib/quest-stream', () => ({ QuestStream: class {
  constructor(options: { token: string; onSnapshot: (value: unknown) => void }) {
    Object.assign(this, { close: vi.fn() });
    streams.push({ ...options, close: this.close });
  }
  close = vi.fn();
} }));

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); streams.length = 0; });

const frame = (timestamp: number) => ({ coordinateFrame: 'quest-local-floor', deviceTimestampMs: timestamp,
  receivedTimestampMs: timestamp, hands: {
    left: { sourcePresent: false, poseObserved: false, joints: [] },
    right: { sourcePresent: false, poseObserved: false, joints: [] },
  } });
const record = (viewerToken = 'token') => ({ id: 'session', viewerToken, name: 'test', projectId: 'p', siteId: 's',
  taskId: 't', instruction: 'test', questDeviceId: 'quest', status: 'active', createdAtMs: 0, updatedAtMs: 0,
  startedAtMs: 0, stoppedAtMs: null, activeEpisodeId: null, episodes: [], pairing: { code: '123456', expiresAtMs: 99_999 },
  sourceState: 'ready', lastSeenAtMs: 0, observedAtMs: 0, frame: frame(0) });

it('느린 메타데이터 응답을 기다리지 않고 최신 손 프레임을 반환한다', async () => {
  vi.useFakeTimers();
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(record()))
    .mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; })));
  const port = createHttpQuestFlywheel();
  const stop = port.subscribeCollectionTelemetry!('session', vi.fn());
  await port.getCollectionTelemetry('session');
  streams[0]!.onSnapshot({ sourceState: 'ready', frame: frame(1) });
  await vi.advanceTimersByTimeAsync(900);
  streams[0]!.onSnapshot({ sourceState: 'ready', frame: frame(2) });
  await vi.advanceTimersByTimeAsync(100);
  expect(finish).toBeDefined();
  streams[0]!.onSnapshot({ sourceState: 'ready', frame: frame(3) });
  expect((await port.getCollectionTelemetry('session'))?.handPose?.deviceTimestampMs).toBe(3);
  finish?.(Response.json(record()));
  await vi.advanceTimersByTimeAsync(0);
  expect((await port.getCollectionTelemetry('session'))?.handPose?.deviceTimestampMs).toBe(3);
  stop(); port.dispose?.();
  expect(vi.getTimerCount()).toBe(0);
});

it('서버 재시작으로 바뀐 보기 토큰으로 스트림을 다시 연다', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(record()))
    .mockResolvedValueOnce(Response.json(record('renewed'))));
  const port = createHttpQuestFlywheel();
  const stop = port.subscribeCollectionTelemetry!('session', vi.fn());
  await port.getCollectionTelemetry('session');
  await port.getCollectionTelemetry('session');
  expect(streams).toHaveLength(2);
  expect(streams[0]!.close).toHaveBeenCalledOnce();
  expect(streams[1]!.token).toBe('renewed');
  stop(); port.dispose?.();
  expect(streams[1]!.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('진행 중인 세션에서도 저장한 에피소드를 카탈로그에 공개한다', async () => {
  const episode = { id: 'episode', name: 'Episode 01', status: 'completed', outcome: 'success', startedAtMs: 0,
    endedAtMs: 1000, bytesWritten: 100, frameCount: 10, observedFrameCount: 10, acknowledgements: [], finalizationError: null,
    videos: [{ id: 'head', label: '헤드', role: 'head', rotation: 0, mimeType: 'video/webm', status: 'completed', bytesWritten: 200 }] };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{ ...record(), episodes: [episode] }])));
  const port = createHttpQuestFlywheel();
  expect(await port.listCatalogCollections()).toEqual([expect.objectContaining({ id: 'session', episodeIds: ['episode'] })]);
  expect(await port.getCatalogCollection('session')).not.toBeNull();
  expect(await port.getEpisode('episode')).toMatchObject({ bytesWritten: 300, frameCount: 10, videos: [expect.objectContaining({ id: 'head' })] });
  port.dispose();
});

it('서버에서 제공한 수집 실패 이유를 숨기지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'Quest 손 추적 연결을 먼저 완료하세요.' }, { status: 409 })));
  const port = createHttpQuestFlywheel();
  await expect(port.startSession('session')).rejects.toThrow('Quest 손 추적 연결을 먼저 완료하세요.');
  port.dispose();
});
