import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RobotVideoContext } from '../model/robot-video-context';
import type {
  RobotVideoPort,
  VideoConnectionStatus,
} from '../model/robot-video';
import { RobotCameraGrid } from './RobotCameraGrid';
import { useSegmentationOverlay } from './use-segmentation-overlay';

vi.mock('./use-segmentation-overlay', () => ({
  useSegmentationOverlay: vi.fn(),
}));

function createDeferredSession() {
  let resolvePromise: (session: Awaited<ReturnType<RobotVideoPort['openSource']>>) => void =
    () => undefined;
  const promise = new Promise<Awaited<ReturnType<RobotVideoPort['openSource']>>>(
    (resolve) => {
      resolvePromise = resolve;
    },
  );
  return { promise, resolve: resolvePromise };
}

beforeEach(() => {
  vi.mocked(useSegmentationOverlay).mockReturnValue({
    labels: [],
    metrics: null,
  });
});

afterEach(() => vi.restoreAllMocks());

describe('RobotCameraGrid workspace', () => {
  it('논리 카메라 선택만 녹화 capability에 전달하고 반환된 원본과 매니페스트를 제공한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:camera-original')
      .mockReturnValueOnce('blob:camera-manifest');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const sources = [
      { id: 'camera-front', robotId: 'robot-001', displayName: '전방 Camera' },
      { id: 'camera-rear', robotId: 'robot-001', displayName: '후방 Camera' },
    ];
    const stop = vi.fn(() => Promise.resolve({
      artifacts: [{
        blob: new Blob(['recording'], { type: 'video/webm' }),
        fileName: 'robot-camera-original.webm',
        mimeType: 'video/webm',
      }],
      manifest: {
        schemaVersion: 1 as const,
        robotId: 'robot-001',
        startedAtMs: 1,
        stoppedAtMs: 2,
        requestedSourceIds: ['camera-front'],
        crops: [{
          sourceId: 'camera-front',
          displayName: '전방 Camera',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        }],
        mediaFiles: [{ fileName: 'robot-camera-original.webm', mimeType: 'video/webm' }],
      },
      manifestFileName: 'robot-camera-original.json',
    }));
    const startRecording = vi.fn(() => Promise.resolve({
      cancel: () => undefined,
      stop,
    }));
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const port: RobotVideoPort = {
      recording: { startRecording },
      listSources: () => Promise.resolve(sources),
      openSource: () => Promise.resolve({
        close: () => undefined,
        mediaStream: stream,
        subscribeStatus: (listener) => {
          listener('connected');
          return () => undefined;
        },
      }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid recordingEnabled robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    await user.click(await screen.findByRole('checkbox', { name: '후방 Camera' }));
    await user.click(screen.getByRole('button', { name: '원본 녹화 시작' }));
    await waitFor(() => expect(startRecording).toHaveBeenCalledWith({
      robotId: 'robot-001',
      sourceIds: ['camera-front'],
    }, expect.any(AbortSignal)));
    await user.click(await screen.findByRole('button', { name: '원본 녹화 중지' }));

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(screen.getByRole('link', { name: 'robot-camera-original.webm 다운로드' }))
      .toHaveAttribute('href', 'blob:camera-original');
    expect(screen.getByRole('link', { name: 'robot-camera-original.json 다운로드' }))
      .toHaveAttribute('href', 'blob:camera-manifest');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it('세그멘테이션을 켜면 라벨을 마스크 색상의 선명한 텍스트로 표시한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.mocked(useSegmentationOverlay).mockReturnValue({
      labels: [{
        className: 'person',
        color: '#99d334',
        confidence: 0.93,
        left: 0.25,
        right: 0.75,
        top: 0.5,
      }],
      metrics: { framesPerSecond: 12, latencyMs: 40 },
    });
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const port: RobotVideoPort = {
      listSources: () => Promise.resolve([{
        id: 'camera-front',
        robotId: 'robot-001',
        displayName: '전방 Camera',
      }]),
      openSource: () => Promise.resolve({
        close: () => undefined,
        mediaStream: stream,
        subscribeStatus: (listener) => {
          listener('connected');
          return () => undefined;
        },
      }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid presentation="monitoring" robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );
    await user.click(await screen.findByRole('button', {
      name: '전방 Camera 세그멘테이션 켜기',
    }));

    const label = screen.getByText('person 0.93');
    expect(label).toHaveStyle({
      backgroundColor: '#99d334',
      left: '25%',
      top: '50%',
      transform: 'translateY(calc(-100% - 2px))',
    });
    expect(label).toHaveClass('text-[10px]', 'text-neutral-950');
  });

  it('관제 화면은 연결 상태 장식을 숨기고 영상 원본 비율을 유지한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const port: RobotVideoPort = {
      listSources: () =>
        Promise.resolve([
          {
            id: 'camera-front',
            robotId: 'robot-001',
            displayName: '전방 Camera',
          },
          {
            id: 'camera-rear',
            robotId: 'robot-001',
            displayName: '후방 Camera',
          },
        ]),
      openSource: () =>
        Promise.resolve({
          close: () => undefined,
          mediaStream: stream,
          subscribeStatus: (listener) => {
            listener('connected');
            return () => undefined;
          },
        }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <div className="h-dvh">
          <RobotCameraGrid
            presentation="monitoring"
            robotId="robot-001"
          />
        </div>
      </RobotVideoContext.Provider>,
    );

    const grid = await screen.findByRole('region', { name: '카메라 영상' });
    const frontVideo = await screen.findByLabelText('전방 Camera 영상');
    Object.defineProperties(frontVideo, {
      videoHeight: { configurable: true, value: 720 },
      videoWidth: { configurable: true, value: 960 },
    });
    fireEvent.loadedMetadata(frontVideo);
    const frontTile = frontVideo.closest('[data-camera-tile="true"]');
    expect(grid).toHaveAttribute('data-presentation', 'monitoring');
    expect(grid).toHaveClass(
      'h-full',
      'overflow-hidden',
      'place-content-center',
      'grid-cols-[repeat(var(--camera-columns-compact),max-content)]',
    );
    expect(grid).toHaveStyle({ containerType: 'size' });
    expect(frontVideo).toHaveClass(
      'absolute',
      'h-full',
      'w-full',
      'object-contain',
    );
    expect(frontVideo).not.toHaveClass('object-cover');
    expect(frontTile).toHaveClass(
      'max-h-full',
      'max-w-full',
      'overflow-hidden',
    );
    expect(frontTile).toHaveStyle({
      aspectRatio: '960 / 720',
      height: 'min(var(--camera-tile-max-height), calc(var(--camera-tile-max-width) / 1.3333333333333333))',
      width: 'min(var(--camera-tile-max-width), calc(var(--camera-tile-max-height) * 1.3333333333333333))',
    });
    expect(frontTile?.parentElement).toHaveClass(
      'flex',
      'items-center',
      'justify-center',
    );
    expect(
      frontTile
        ?.querySelector('[data-connection-indicator="connected"]'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '전방 Camera 확대 보기' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: '전방 Camera 세그멘테이션 켜기' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(frontTile?.querySelector('[data-segmentation-overlay="true"]'))
      .not.toBeInTheDocument();
    expect(frontTile?.querySelector('[data-segmentation-metrics="true"]'))
      .not.toBeInTheDocument();
  });

  it('원본 영상을 유지한 채 카메라별 세그멘테이션을 켜고 끈다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const port: RobotVideoPort = {
      listSources: () => Promise.resolve([{
        id: 'camera-front',
        robotId: 'robot-001',
        displayName: '전방 Camera',
      }]),
      openSource: () => Promise.resolve({
        close: () => undefined,
        mediaStream: stream,
        subscribeStatus: (listener) => {
          listener('connected');
          return () => undefined;
        },
      }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid
          presentation="monitoring"
          robotId="robot-001"
        />
      </RobotVideoContext.Provider>,
    );

    const video = await screen.findByLabelText('전방 Camera 영상');
    await user.click(screen.getByRole('button', {
      name: '전방 Camera 세그멘테이션 켜기',
    }));
    expect(screen.getByRole('button', {
      name: '전방 Camera 세그멘테이션 끄기',
    })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-segmentation-overlay="true"]'))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', {
      name: '전방 Camera 세그멘테이션 끄기',
    }));

    expect(video).toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: '전방 Camera 세그멘테이션 켜기',
    })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', {
      name: '전방 Camera 확대 보기',
    })).not.toBeInTheDocument();
    expect(document.querySelector('[data-segmentation-overlay="true"]')).toBeNull();
    expect(document.querySelector('[data-segmentation-metrics="true"]')).toBeNull();
  });

  it('관제 타일을 확대하면 선택 영상만 커지고 나머지는 축소·페이드한 뒤 복구한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const port: RobotVideoPort = {
      listSources: () => Promise.resolve([
        {
          id: 'camera-front',
          robotId: 'robot-001',
          displayName: '전방 Camera',
        },
        {
          id: 'camera-rear',
          robotId: 'robot-001',
          displayName: '후방 Camera',
        },
      ]),
      openSource: () => Promise.resolve({
        close: () => undefined,
        mediaStream: stream,
        subscribeStatus: (listener) => {
          listener('connected');
          return () => undefined;
        },
      }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid presentation="monitoring" robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    const grid = await screen.findByRole('region', { name: '카메라 영상' });
    await user.click(
      await screen.findByRole('button', { name: '후방 Camera 확대 보기' }),
    );

    const focused = screen.getByRole('region', { name: '후방 Camera 영상 영역' });
    const dimmed = document.querySelector<HTMLElement>(
      '[data-camera-focus-state="dimmed"]',
    );
    expect(grid).toHaveAttribute('data-focused-source', 'camera-rear');
    expect(focused).toHaveAttribute('data-camera-focus-state', 'focused');
    expect(focused).toHaveClass('absolute', 'inset-0', 'z-20');
    expect(dimmed).toHaveClass('scale-75', 'opacity-0', 'pointer-events-none');
    expect(dimmed).toHaveAttribute('aria-hidden', 'true');
    expect(dimmed).toHaveAttribute('inert');

    const closeFocus = screen.getByRole('button', {
      name: '후방 Camera 확대 보기 종료',
    });
    expect(closeFocus).toHaveAttribute('aria-pressed', 'true');
    await user.click(closeFocus);

    await waitFor(() => expect(grid).not.toHaveAttribute('data-focused-source'));
    expect(document.querySelector('[data-camera-focus-state="dimmed"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: '후방 Camera 확대 보기' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(grid).not.toHaveAttribute('data-focused-source'));
    expect(document.querySelector('[data-camera-focus-state="dimmed"]')).toBeNull();
    expect(
      screen.getByRole('button', { name: '후방 Camera 확대 보기' }),
    ).toHaveFocus();
  });

  it('관제 화면의 연결 대기 상태를 중앙 스피너와 한 문구로 표시한다', async () => {
    const deferred = createDeferredSession();
    const port: RobotVideoPort = {
      listSources: () => Promise.resolve([{
        id: 'camera-front',
        robotId: 'robot-001',
        displayName: '전방 Camera',
      }]),
      openSource: () => deferred.promise,
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid presentation="monitoring" robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    const pendingSpinner = await screen.findByRole('status', {
      name: '카메라 영상을 불러오는 중입니다.',
    });
    const pendingState = pendingSpinner.closest('[data-camera-state="connecting"]');
    expect(pendingState).toBeInTheDocument();
    expect(
      pendingState?.querySelector('[data-loading-spinner="true"]'),
    ).toBeInTheDocument();
    expect(
      pendingState?.querySelectorAll('p'),
    ).toHaveLength(0);
    expect(
      pendingState?.querySelector('[data-connection-indicator]'),
    ).not.toBeInTheDocument();
  });

  it('합성 카메라 5개의 방향을 3×2 관제 배치에서 유지한다', async () => {
    const deferred = createDeferredSession();
    const sourceNames = [
      '좌측 전방',
      '전방',
      '우측 전방',
      '좌측 후방',
      '우측 후방',
    ];
    const port: RobotVideoPort = {
      listSources: () => Promise.resolve(sourceNames.map((displayName, index) => ({
        displayName,
        id: `grid-source-${String(index + 1)}`,
        robotId: 'robot-001',
      }))),
      openSource: () => deferred.promise,
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid presentation="monitoring" robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    const grid = await screen.findByRole('region', { name: '카메라 영상' });
    expect(grid).toHaveStyle({
      '--camera-columns-wide': '6',
      '--camera-rows-wide': '2',
    });
    expect(
      screen.getByRole('region', { name: '좌측 후방 영상 영역' }),
    ).toHaveClass('sm:col-span-2', 'sm:col-start-2', 'sm:row-start-2');
    expect(
      screen.getByRole('region', { name: '우측 후방 영상 영역' }),
    ).toHaveClass('sm:col-span-2', 'sm:col-start-4', 'sm:row-start-2');
  });

  it('모든 source를 연결한 상태에서 크게 볼 Camera를 전환한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const port: RobotVideoPort = {
      listSources: () =>
        Promise.resolve([
          {
            id: 'camera-front',
            robotId: 'robot-001',
            displayName: '전방 Camera',
          },
          {
            id: 'camera-rear',
            robotId: 'robot-001',
            displayName: '후방 Camera',
          },
        ]),
      openSource: () =>
        Promise.resolve({
          close: () => undefined,
          mediaStream: stream,
          subscribeStatus: (listener) => {
            listener('connected');
            return () => undefined;
          },
        }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid presentation="workspace" robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByLabelText('전방 Camera 영상')).toBeInTheDocument();
    expect(screen.getByLabelText('후방 Camera 영상')).toBeInTheDocument();
    const enlargeRear = screen.getByRole('button', {
      name: '후방 Camera 크게 보기',
    });
    enlargeRear.focus();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('button', { name: '전방 Camera 크게 보기' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: '후방 Camera 영상 영역' }),
    ).toHaveFocus();
  });

  it('source 목록 조회 실패를 retry하고 정상 영상 상태로 복구한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const listSources = vi
      .fn<RobotVideoPort['listSources']>()
      .mockRejectedValueOnce(new Error('Camera 목록 조회 실패'))
      .mockResolvedValueOnce([
        {
          id: 'camera-front',
          robotId: 'robot-001',
          displayName: '전방 Camera',
        },
      ]);
    const port: RobotVideoPort = {
      listSources,
      openSource: () =>
        Promise.resolve({
          close: () => undefined,
          mediaStream: stream,
          subscribeStatus: (listener) => {
            listener('connected');
            return () => undefined;
          },
        }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '카메라 목록을 불러오지 못했습니다.',
    );
    expect(screen.queryByText('Camera 목록 조회 실패')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByLabelText('전방 Camera 영상')).toBeInTheDocument();
    expect(listSources).toHaveBeenCalledTimes(2);
  });

  it('한 source 실패가 다른 source를 닫지 않으며 실패 source만 재시도한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let rearAttempts = 0;
    const openSource = vi.fn<RobotVideoPort['openSource']>((sourceId) => {
      if (sourceId === 'camera-rear' && rearAttempts === 0) {
        rearAttempts += 1;
        return Promise.reject(
          new Error('카메라 영상 track을 기다리는 시간이 초과되었습니다.'),
        );
      }
      return Promise.resolve({
        close: () => undefined,
        mediaStream: stream,
        subscribeStatus: (listener) => {
          listener('connected');
          return () => undefined;
        },
      });
    });
    const port: RobotVideoPort = {
      listSources: () =>
        Promise.resolve([
          {
            id: 'camera-front',
            robotId: 'robot-001',
            displayName: '전방 Camera',
          },
          {
            id: 'camera-rear',
            robotId: 'robot-001',
            displayName: '후방 Camera',
          },
        ]),
      openSource,
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByLabelText('전방 Camera 영상')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '후방 Camera: 카메라 영상을 불러오지 못했습니다.',
    );
    expect(screen.queryByText(/track을 기다리/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 연결' }));
    expect(await screen.findByLabelText('후방 Camera 영상')).toBeInTheDocument();
    expect(openSource).toHaveBeenCalledTimes(3);
  });

  it('연결 상태 전환을 source 이름과 함께 하나의 live region으로 알린다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let emitStatus: (status: VideoConnectionStatus) => void = () => undefined;
    const port: RobotVideoPort = {
      listSources: () =>
        Promise.resolve([
          {
            id: 'camera-front',
            robotId: 'robot-001',
            displayName: '전방 Camera',
          },
        ]),
      openSource: () =>
        Promise.resolve({
          close: () => undefined,
          mediaStream: stream,
          subscribeStatus: (listener) => {
            emitStatus = listener;
            return () => undefined;
          },
        }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByLabelText('전방 Camera 영상')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('전방 Camera: 영상 불러오는 중');

    act(() => emitStatus('connected'));
    expect(screen.getByRole('status')).toHaveTextContent('전방 Camera: 영상 표시 중');

    act(() => emitStatus('reconnecting'));
    expect(screen.getByRole('status')).toHaveTextContent('전방 Camera: 영상 다시 불러오는 중');

    act(() => emitStatus('error'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '전방 Camera: 카메라 영상을 불러오지 못했습니다.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    act(() => emitStatus('error'));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('예상하지 못한 연결 끊김에서도 기존 session을 닫고 다시 연결한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const user = userEvent.setup();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const closeFirst = vi.fn();
    const unsubscribeFirst = vi.fn();
    let emitFirst: (status: VideoConnectionStatus) => void = () => undefined;
    const openSource = vi
      .fn<RobotVideoPort['openSource']>()
      .mockResolvedValueOnce({
        close: closeFirst,
        mediaStream: stream,
        subscribeStatus: (listener) => {
          emitFirst = listener;
          listener('connected');
          return unsubscribeFirst;
        },
      })
      .mockResolvedValueOnce({
        close: () => undefined,
        mediaStream: stream,
        subscribeStatus: (listener) => {
          listener('connected');
          return () => undefined;
        },
      });
    const port: RobotVideoPort = {
      listSources: () => Promise.resolve([{
        id: 'camera-front',
        robotId: 'robot-001',
        displayName: '전방 Camera',
      }]),
      openSource,
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByLabelText('전방 Camera 영상')).toBeInTheDocument();
    act(() => emitFirst('disconnected'));
    expect(screen.getByRole('status')).toHaveTextContent(
      '전방 Camera: 카메라 영상이 끊겼습니다.',
    );
    await user.click(screen.getByRole('button', { name: '다시 연결' }));

    await waitFor(() => expect(openSource).toHaveBeenCalledTimes(2));
    expect(unsubscribeFirst).toHaveBeenCalledOnce();
    expect(closeFirst).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('전방 Camera: 영상 표시 중');
  });

  it('연결 상태 구독이 동기 실패하면 session을 닫고 복구 동작을 제공한다', async () => {
    const close = vi.fn();
    const port: RobotVideoPort = {
      listSources: () => Promise.resolve([{
        id: 'camera-front',
        robotId: 'robot-001',
        displayName: '전방 Camera',
      }]),
      openSource: () => Promise.resolve({
        close,
        mediaStream: { getTracks: () => [] } as unknown as MediaStream,
        subscribeStatus: () => {
          throw new Error('상태 구독 실패');
        },
      }),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '카메라 영상을 불러오지 못했습니다.',
    );
    expect(screen.queryByText('상태 구독 실패')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 연결' })).toBeEnabled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('재시도하는 동안 다시 연결 중 상태를 알리고 성공 상태로 갱신한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const user = userEvent.setup();
    const deferred = createDeferredSession();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const openSource = vi
      .fn<RobotVideoPort['openSource']>()
      .mockRejectedValueOnce(new Error('전방 Camera 연결 실패'))
      .mockReturnValueOnce(deferred.promise);
    const port: RobotVideoPort = {
      listSources: () =>
        Promise.resolve([
          {
            id: 'camera-front',
            robotId: 'robot-001',
            displayName: '전방 Camera',
          },
        ]),
      openSource,
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '전방 Camera: 카메라 영상을 불러오지 못했습니다.',
    );
    await user.click(screen.getByRole('button', { name: '다시 연결' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      '전방 Camera: 영상 다시 불러오는 중',
    );

    await act(async () => {
      deferred.resolve({
        close: () => undefined,
        mediaStream: stream,
        subscribeStatus: (listener) => {
          listener('connected');
          return () => undefined;
        },
      });
      await deferred.promise;
    });

    expect(await screen.findByLabelText('전방 Camera 영상')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('전방 Camera: 영상 표시 중');
    expect(openSource).toHaveBeenCalledTimes(2);
  });

  it('openSource가 늦게 완료돼도 unmount된 카드의 session을 즉시 닫는다', async () => {
    const deferred = createDeferredSession();
    const close = vi.fn();
    const subscribeStatus = vi.fn(() => () => undefined);
    let connectionSignal: AbortSignal | undefined;
    const port: RobotVideoPort = {
      listSources: () =>
        Promise.resolve([
          {
            id: 'camera-front',
            robotId: 'robot-001',
            displayName: '전방 Camera',
          },
        ]),
      openSource: (_sourceId, signal) => {
        connectionSignal = signal;
        return deferred.promise;
      },
    };
    const view = render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByRole('status', {
      name: '전방 Camera: 영상 불러오는 중',
    })).toBeInTheDocument();
    await waitFor(() => expect(connectionSignal?.aborted).toBe(false));
    view.unmount();
    expect(connectionSignal?.aborted).toBe(true);
    deferred.resolve({
      close,
      mediaStream: { getTracks: () => [] } as unknown as MediaStream,
      subscribeStatus,
    });

    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(subscribeStatus).not.toHaveBeenCalled();
  });

  it('Robot이 바뀌면 이전 source의 상태 구독과 session만 정리한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const firstUnsubscribe = vi.fn();
    const secondUnsubscribe = vi.fn();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const port: RobotVideoPort = {
      listSources: (robotId) =>
        Promise.resolve([
          {
            id: `${robotId}-camera-front`,
            robotId,
            displayName: `${robotId} 전방 Camera`,
          },
        ]),
      openSource: (sourceId) =>
        Promise.resolve({
          close: sourceId.startsWith('robot-001') ? firstClose : secondClose,
          mediaStream: stream,
          subscribeStatus: (listener) => {
            listener('connected');
            return sourceId.startsWith('robot-001')
              ? firstUnsubscribe
              : secondUnsubscribe;
          },
        }),
    };
    const view = render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByLabelText('robot-001 전방 Camera 영상')).toBeInTheDocument();
    view.rerender(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-002" />
      </RobotVideoContext.Provider>,
    );
    expect(await screen.findByLabelText('robot-002 전방 Camera 영상')).toBeInTheDocument();
    expect(firstUnsubscribe).toHaveBeenCalledOnce();
    expect(firstClose).toHaveBeenCalledOnce();
    expect(secondUnsubscribe).not.toHaveBeenCalled();
    expect(secondClose).not.toHaveBeenCalled();

    view.unmount();
    expect(secondUnsubscribe).toHaveBeenCalledOnce();
    expect(secondClose).toHaveBeenCalledOnce();
  });

  it('상태 구독 해제가 실패해도 unmount에서 session을 닫는다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const close = vi.fn();
    const unsubscribe = vi.fn(() => {
      throw new Error('상태 구독 해제 실패');
    });
    const port: RobotVideoPort = {
      listSources: () => Promise.resolve([{
        id: 'camera-front',
        robotId: 'robot-001',
        displayName: '전방 Camera',
      }]),
      openSource: () => Promise.resolve({
        close,
        mediaStream: { getTracks: () => [] } as unknown as MediaStream,
        subscribeStatus: (listener) => {
          listener('connected');
          return unsubscribe;
        },
      }),
    };
    const view = render(
      <RobotVideoContext.Provider value={port}>
        <RobotCameraGrid robotId="robot-001" />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByLabelText('전방 Camera 영상')).toBeInTheDocument();
    expect(() => view.unmount()).not.toThrow();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
