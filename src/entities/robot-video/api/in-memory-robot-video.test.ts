import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryRobotVideoAdapter } from './in-memory-robot-video';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('InMemoryRobotVideoAdapter', () => {
  it('source별 MediaStream 생명주기를 독립적으로 관리한다', async () => {
    const stop = vi.fn();
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const adapter = new InMemoryRobotVideoAdapter(['robot-001'], (source) => {
      if (source.id.endsWith('rear')) throw new Error('후방 Camera 연결 실패');
      return { stream, stop };
    });
    const sources = await adapter.listSources('robot-001');
    expect(sources).toHaveLength(2);
    expect(JSON.stringify(sources)).not.toMatch(/mock|fixture|in-memory|simulated|simulator/i);

    const front = await adapter.openSource(sources[0]?.id ?? '');
    const statuses: string[] = [];
    front.subscribeStatus((status) => statuses.push(status));
    await expect(adapter.openSource(sources[1]?.id ?? '')).rejects.toThrow('후방 Camera 연결 실패');
    expect(stop).not.toHaveBeenCalled();

    front.close();
    expect(stop).toHaveBeenCalledOnce();
    expect(statuses).toEqual(['connected', 'disconnected']);
  });

  it('이미 취소된 연결 시도는 MediaStream을 만들지 않는다', async () => {
    const streamFactory = vi.fn(() => ({
      stream: { getTracks: () => [] } as unknown as MediaStream,
      stop: vi.fn(),
    }));
    const adapter = new InMemoryRobotVideoAdapter(['robot-001'], streamFactory);
    const source = (await adapter.listSources('robot-001'))[0];
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.openSource(source?.id ?? '', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(streamFactory).not.toHaveBeenCalled();
  });

  it('dispose에서 열린 모든 MediaStream을 닫고 재사용을 막는다', async () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let sequence = 0;
    const adapter = new InMemoryRobotVideoAdapter(['robot-001'], () => {
      sequence += 1;
      return {
        stream,
        stop: sequence === 1 ? firstStop : secondStop,
      };
    });
    const sources = await adapter.listSources('robot-001');
    const firstSession = await adapter.openSource(sources[0]?.id ?? '');
    await adapter.openSource(sources[1]?.id ?? '');

    firstSession.close();
    adapter.dispose();
    adapter.dispose();

    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
    await expect(adapter.openSource(sources[0]?.id ?? '')).rejects.toThrow(
      '종료된 Video Adapter',
    );
    await expect(adapter.listSources('robot-001')).rejects.toThrow(
      '종료된 Video Adapter',
    );
  });

  it('초기 status listener가 실패하면 닫힌 session에 부분 구독을 남기지 않는다', async () => {
    const stop = vi.fn();
    const adapter = new InMemoryRobotVideoAdapter(['robot-001'], () => ({
      stream: { getTracks: () => [] } as unknown as MediaStream,
      stop,
    }));
    const source = (await adapter.listSources('robot-001'))[0];
    const session = await adapter.openSource(source?.id ?? '');
    const listener = vi.fn(() => {
      throw new Error('초기 status listener 실패');
    });

    expect(() => session.subscribeStatus(listener)).toThrow(
      '초기 status listener 실패',
    );
    session.close();

    expect(listener).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('status listener 하나가 실패해도 모든 열린 session을 닫는다', async () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    let sequence = 0;
    const adapter = new InMemoryRobotVideoAdapter(['robot-001'], () => {
      sequence += 1;
      return {
        stream: { getTracks: () => [] } as unknown as MediaStream,
        stop: sequence === 1 ? firstStop : secondStop,
      };
    });
    const sources = await adapter.listSources('robot-001');
    const first = await adapter.openSource(sources[0]?.id ?? '');
    await adapter.openSource(sources[1]?.id ?? '');
    first.subscribeStatus((status) => {
      if (status === 'disconnected') {
        throw new Error('status listener 실패');
      }
    });

    expect(() => adapter.dispose()).not.toThrow();

    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
  });

  it('video stream을 지원하지 않는 환경에서는 명확한 오류를 반환한다', async () => {
    const play = vi.fn();
    const video = { play } as unknown as HTMLVideoElement;
    vi.spyOn(document, 'createElement').mockReturnValue(video);
    const adapter = new InMemoryRobotVideoAdapter(['robot-001']);
    const source = (await adapter.listSources('robot-001'))[0];

    await expect(adapter.openSource(source?.id ?? '')).rejects.toThrow(
      '영상을 생성할 수 없는 브라우저 환경',
    );
    expect(play).not.toHaveBeenCalled();
  });

  it('제공된 카메라 영상을 음소거 상태로 반복 재생하고 stream으로 변환한다', async () => {
    const stopTrack = vi.fn();
    const track = { stop: stopTrack } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    const captureStream = vi.fn(() => stream);
    const pause = vi.fn();
    const load = vi.fn();
    const removeAttribute = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    const video = {
      captureStream,
      load,
      loop: false,
      muted: false,
      pause,
      play,
      playsInline: false,
      preload: '',
      removeAttribute,
      src: '',
    } as unknown as HTMLVideoElement;
    vi.spyOn(document, 'createElement').mockReturnValue(video);
    const adapter = new InMemoryRobotVideoAdapter(['robot-001']);
    const source = (await adapter.listSources('robot-001'))[0];
    const session = await adapter.openSource(source?.id ?? '');

    expect(video.src).toBe('/assets/low-altitude-first-person-pov.mp4');
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.preload).toBe('auto');
    expect(play).toHaveBeenCalledOnce();
    expect(captureStream).toHaveBeenCalledOnce();

    expect(() => session.close()).not.toThrow();

    expect(pause).toHaveBeenCalledOnce();
    expect(removeAttribute).toHaveBeenCalledWith('src');
    expect(load).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('video 재생이 실패하면 source를 즉시 정리한다', async () => {
    const pause = vi.fn();
    const load = vi.fn();
    const removeAttribute = vi.fn();
    const video = {
      captureStream: vi.fn(),
      load,
      pause,
      play: vi.fn().mockRejectedValue(new Error('video 재생 실패')),
      removeAttribute,
    } as unknown as HTMLVideoElement;
    vi.spyOn(document, 'createElement').mockReturnValue(video);
    const adapter = new InMemoryRobotVideoAdapter(['robot-001']);
    const source = (await adapter.listSources('robot-001'))[0];

    await expect(adapter.openSource(source?.id ?? '')).rejects.toThrow(
      'video 재생 실패',
    );
    expect(pause).toHaveBeenCalledOnce();
    expect(removeAttribute).toHaveBeenCalledWith('src');
    expect(load).toHaveBeenCalledOnce();
  });
});
