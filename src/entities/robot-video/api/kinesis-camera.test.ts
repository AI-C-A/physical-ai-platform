import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CompositeGridCrop,
  CompositeGridVideoCropper,
  CompositeGridVideoCropperFactory,
} from './composite-grid-video';
import { KinesisCameraAdapter } from './kinesis-camera';

class FakeMediaStream {
  readonly tracks: MediaStreamTrack[] = [];

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

class FakeSignalingClient {
  static latest: FakeSignalingClient | null = null;

  readonly configuration: unknown;
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly open = vi.fn();
  readonly close = vi.fn();
  readonly drainPendingIceCandidates = vi.fn();
  readonly sendIceCandidate = vi.fn();
  readonly sendSdpOffer = vi.fn();

  constructor(configuration: unknown) {
    this.configuration = configuration;
    FakeSignalingClient.latest = this;
  }

  addListener(eventName: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }

  emit(eventName: string, ...args: unknown[]): void {
    this.listeners.get(eventName)?.forEach((listener) => listener(...args));
  }
}

class FakeMediaRecorder {
  readonly mimeType = 'video/webm';
  readonly start = vi.fn(() => {
    this.state = 'recording';
  });
  readonly stop = vi.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.call(this as unknown as MediaRecorder, {
      data: new Blob(['composite-recording'], { type: this.mimeType }),
    } as BlobEvent);
    this.onstop?.call(this as unknown as MediaRecorder, new Event('stop'));
  });
  state: RecordingState = 'inactive';
  ondataavailable: ((this: MediaRecorder, event: BlobEvent) => unknown) | null = null;
  onerror: ((this: MediaRecorder, event: Event) => unknown) | null = null;
  onstop: ((this: MediaRecorder, event: Event) => unknown) | null = null;
}

interface FakePeerConnection {
  readonly value: RTCPeerConnection;
  readonly addIceCandidate: ReturnType<typeof vi.fn>;
  readonly addTransceiver: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly createOffer: ReturnType<typeof vi.fn>;
  readonly setLocalDescription: ReturnType<typeof vi.fn>;
  readonly setRemoteDescription: ReturnType<typeof vi.fn>;
  setConnectionState(state: RTCPeerConnectionState): void;
  setIceConnectionState(state: RTCIceConnectionState): void;
  receiveTrack(track: MediaStreamTrack): void;
  sendLocalCandidate(candidate: RTCIceCandidate): void;
}

function createPeerConnection(): FakePeerConnection {
  const addIceCandidate = vi.fn(() => Promise.resolve());
  const addTransceiver = vi.fn();
  const close = vi.fn();
  const createOffer = vi.fn(() => Promise.resolve({ type: 'offer', sdp: 'viewer-offer' }));
  let localDescription: RTCSessionDescription | null = null;
  const setLocalDescription = vi.fn((description: RTCSessionDescriptionInit) => {
    localDescription = description as RTCSessionDescription;
    return Promise.resolve();
  });
  const setRemoteDescription = vi.fn(() => Promise.resolve());
  const value = {
    addIceCandidate,
    addTransceiver,
    close,
    connectionState: 'new' as RTCPeerConnectionState,
    createOffer,
    iceConnectionState: 'new' as RTCIceConnectionState,
    get localDescription() {
      return localDescription;
    },
    onconnectionstatechange: null as ((event: Event) => void) | null,
    onicecandidate: null as ((event: RTCPeerConnectionIceEvent) => void) | null,
    oniceconnectionstatechange: null as ((event: Event) => void) | null,
    ontrack: null as ((event: RTCTrackEvent) => void) | null,
    setLocalDescription,
    setRemoteDescription,
  } as unknown as RTCPeerConnection;
  return {
    value,
    addIceCandidate,
    addTransceiver,
    close,
    createOffer,
    setLocalDescription,
    setRemoteDescription,
    setConnectionState(state) {
      Object.defineProperty(value, 'connectionState', { configurable: true, value: state });
      value.onconnectionstatechange?.(new Event('connectionstatechange'));
    },
    setIceConnectionState(state) {
      Object.defineProperty(value, 'iceConnectionState', { configurable: true, value: state });
      value.oniceconnectionstatechange?.(new Event('iceconnectionstatechange'));
    },
    receiveTrack(track) {
      value.ontrack?.({ track } as RTCTrackEvent);
    },
    sendLocalCandidate(candidate) {
      value.onicecandidate?.({ candidate } as RTCPeerConnectionIceEvent);
    },
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return {
    json: () => Promise.resolve(value),
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

function viewerSessionResponse(): Response {
  return jsonResponse({
    clientId: 'viewer-client',
    channelArn: 'arn:aws:kinesisvideo:ap-northeast-2:123456789012:channel/ROBOT-01/1',
    region: 'ap-northeast-2',
    iceServers: [
      { urls: ['stun:stun.kinesisvideo.ap-northeast-2.amazonaws.com:443'] },
      { urls: ['turn:turn.example.com:443'], username: 'viewer', credential: 'temporary-turn' },
    ],
    signedWssUrl: 'wss://v-example.kinesisvideo.ap-northeast-2.amazonaws.com/?X-Amz-Signature=signed',
  });
}

interface FakeCompositeCropper {
  readonly close: ReturnType<typeof vi.fn>;
  readonly factory: CompositeGridVideoCropperFactory;
  readonly openCrop: ReturnType<typeof vi.fn<(crop: CompositeGridCrop) => {
    readonly mediaStream: MediaStream;
    close(): void;
  }>>;
  readonly outputStops: ReturnType<typeof vi.fn>[];
}

function createFakeCompositeCropper(): FakeCompositeCropper {
  const outputStops: ReturnType<typeof vi.fn>[] = [];
  const openCrop = vi.fn((crop: CompositeGridCrop) => {
    const stop = vi.fn();
    const track = {
      id: `crop-${String(crop.row)}-${String(crop.column)}-${String(outputStops.length)}`,
      kind: 'video',
      stop,
    } as unknown as MediaStreamTrack;
    const mediaStream = new MediaStream();
    mediaStream.addTrack(track);
    outputStops.push(stop);
    return {
      mediaStream,
      close: stop,
    };
  });
  const close = vi.fn();
  const cropper = { close, openCrop } satisfies CompositeGridVideoCropper;
  return {
    close,
    factory: vi.fn(() => Promise.resolve(cropper)),
    openCrop,
    outputStops,
  };
}

function createFakeCompositeVideoCropper(
  _sourceStream: MediaStream,
  _signal?: AbortSignal,
): Promise<CompositeGridVideoCropper> {
  return createFakeCompositeCropper().factory(_sourceStream, _signal);
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal('MediaStream', FakeMediaStream);
  FakeSignalingClient.latest = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: undefined,
  });
});

describe('KinesisCameraAdapter', () => {
  it('VIEWER session을 수신 전용으로 연결하고 SDP·ICE·track 생명주기를 정리한다', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const peer = createPeerConnection();
    const fetcher = vi.fn<(
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>>(() => Promise.resolve(viewerSessionResponse()));
    const createPeer = vi.fn((configuration: RTCConfiguration) => {
      expect(configuration.iceServers).toHaveLength(2);
      return peer.value;
    });
    const compositeCropper = createFakeCompositeCropper();
    const adapter = new KinesisCameraAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher,
      createPeerConnection: createPeer,
      createSignalingClient: FakeSignalingClient,
      createCompositeVideoCropper: compositeCropper.factory,
    });
    const sources = await adapter.listSources('robot-01');
    const source = sources[0];
    expect(sources).toEqual([
      {
        id: 'robot-01:patrol-camera:grid-r1-c1',
        robotId: 'robot-01',
        displayName: '좌측 전방',
      },
      {
        id: 'robot-01:patrol-camera:grid-r1-c2',
        robotId: 'robot-01',
        displayName: '전방',
      },
      {
        id: 'robot-01:patrol-camera:grid-r1-c3',
        robotId: 'robot-01',
        displayName: '우측 전방',
      },
      {
        id: 'robot-01:patrol-camera:grid-r2-c1',
        robotId: 'robot-01',
        displayName: '좌측 후방',
      },
      {
        id: 'robot-01:patrol-camera:grid-r2-c3',
        robotId: 'robot-01',
        displayName: '우측 후방',
      },
    ]);

    const opening = adapter.openSource(source?.id ?? '');
    await flushPromises();
    const signaling = FakeSignalingClient.latest;
    expect(signaling).not.toBeNull();
    expect(signaling?.open).toHaveBeenCalledOnce();
    expect(peer.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    expect(getUserMedia).not.toHaveBeenCalled();
    const [input, init] = fetcher.mock.calls[0] ?? [];
    expect(input).toBeInstanceOf(URL);
    if (!(input instanceof URL)) throw new Error('카메라 요청 URL이 필요합니다.');
    expect(input.pathname).toMatch(/\/robots\/robot-01\/camera-viewer-session$/);
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.stringify(init)).not.toMatch(/apiKey|secret|awsKey/i);

    signaling?.emit('open');
    await flushPromises();
    expect(peer.createOffer).toHaveBeenCalledOnce();
    expect(peer.setLocalDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'viewer-offer' });
    expect(signaling?.sendSdpOffer).toHaveBeenCalledOnce();

    const masterAnswer = 'v=0\r\na=rtcp-fb:108 transport-cc\r\n';
    signaling?.emit('sdpAnswer', { type: 'answer', sdp: masterAnswer });
    signaling?.emit('iceCandidate', {
      candidate: 'candidate:1 1 udp 1 127.0.0.1 3478 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
    await flushPromises();
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: masterAnswer });
    expect(signaling?.drainPendingIceCandidates).toHaveBeenCalledOnce();
    expect(peer.addIceCandidate).toHaveBeenCalledOnce();

    const localCandidate = { candidate: 'local-candidate' } as RTCIceCandidate;
    peer.sendLocalCandidate(localCandidate);
    expect(signaling?.sendIceCandidate).toHaveBeenCalledWith(localCandidate);

    const stopTrack = vi.fn();
    const track = { id: 'remote-video', kind: 'video', stop: stopTrack } as unknown as MediaStreamTrack;
    peer.receiveTrack(track);
    const session = await opening;
    expect(compositeCropper.factory).toHaveBeenCalledWith(
      expect.objectContaining({ tracks: [track] }),
      expect.any(AbortSignal),
    );
    expect(compositeCropper.openCrop).toHaveBeenCalledWith({
      column: 0,
      columns: 3,
      row: 0,
      rows: 2,
    });
    expect(session.mediaStream.getVideoTracks()[0]?.id).toBe('crop-0-0-0');
    const statuses: string[] = [];
    session.subscribeStatus((status) => statuses.push(status));
    peer.setConnectionState('connected');
    expect(statuses).toEqual(['connecting', 'connected']);

    session.close();
    session.close();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(signaling?.close).toHaveBeenCalledOnce();
    expect(signaling?.listeners.size).toBe(0);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(compositeCropper.outputStops[0]).toHaveBeenCalledOnce();
    expect(compositeCropper.close).toHaveBeenCalledOnce();
  });

  it('3×2 합성 영상 연결 하나를 가운데 칸을 제외한 5개 source가 공유한다', async () => {
    const peer = createPeerConnection();
    const fetcher = vi.fn(() => Promise.resolve(viewerSessionResponse()));
    const compositeCropper = createFakeCompositeCropper();
    const adapter = new KinesisCameraAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher,
      createPeerConnection: () => peer.value,
      createSignalingClient: FakeSignalingClient,
      createCompositeVideoCropper: compositeCropper.factory,
    });
    const sources = await adapter.listSources('robot-01');

    const openings = sources.map((source) => adapter.openSource(source.id));
    await flushPromises();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(FakeSignalingClient.latest?.open).toHaveBeenCalledOnce();

    const remoteStop = vi.fn();
    peer.receiveTrack({
      id: 'composite-video',
      kind: 'video',
      stop: remoteStop,
    } as unknown as MediaStreamTrack);
    const sessions = await Promise.all(openings);

    expect(compositeCropper.factory).toHaveBeenCalledOnce();
    expect(compositeCropper.openCrop.mock.calls.map(([crop]) => crop)).toEqual([
      { column: 0, columns: 3, row: 0, rows: 2 },
      { column: 1, columns: 3, row: 0, rows: 2 },
      { column: 2, columns: 3, row: 0, rows: 2 },
      { column: 0, columns: 3, row: 1, rows: 2 },
      { column: 2, columns: 3, row: 1, rows: 2 },
    ]);

    sessions.slice(0, -1).forEach((session) => session.close());
    expect(peer.close).not.toHaveBeenCalled();
    sessions.at(-1)?.close();

    expect(peer.close).toHaveBeenCalledOnce();
    expect(remoteStop).toHaveBeenCalledOnce();
    expect(compositeCropper.outputStops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
    expect(compositeCropper.close).toHaveBeenCalledOnce();
  });

  it('여러 논리 카메라를 선택해도 합성 원본 하나와 5개 crop 매니페스트를 기록한다', async () => {
    const peer = createPeerConnection();
    const compositeCropper = createFakeCompositeCropper();
    const recorder = new FakeMediaRecorder();
    const createMediaRecorder = vi.fn(() => recorder as unknown as MediaRecorder);
    const nowMs = vi.fn()
      .mockReturnValueOnce(Date.parse('2026-08-26T01:00:00Z'))
      .mockReturnValueOnce(Date.parse('2026-08-26T01:01:00Z'));
    const adapter = new KinesisCameraAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher: () => Promise.resolve(viewerSessionResponse()),
      createPeerConnection: () => peer.value,
      createSignalingClient: FakeSignalingClient,
      createCompositeVideoCropper: compositeCropper.factory,
      createMediaRecorder,
      nowMs,
    });
    const sources = await adapter.listSources('robot-01');
    const selectedSourceIds = [sources[0]?.id, sources[4]?.id].filter(
      (sourceId): sourceId is string => sourceId !== undefined,
    );

    const starting = adapter.recording.startRecording({
      robotId: 'robot-01',
      sourceIds: selectedSourceIds,
    });
    await flushPromises();
    const remoteStop = vi.fn();
    const upstreamTrack = {
      id: 'composite-video',
      kind: 'video',
      stop: remoteStop,
    } as unknown as MediaStreamTrack;
    peer.receiveTrack(upstreamTrack);
    const recording = await starting;

    expect(createMediaRecorder).toHaveBeenCalledOnce();
    expect(createMediaRecorder).toHaveBeenCalledWith(
      expect.objectContaining({ tracks: [upstreamTrack] }),
      undefined,
    );
    expect(recorder.start).toHaveBeenCalledWith(1_000);
    expect(compositeCropper.openCrop).not.toHaveBeenCalled();

    const result = await recording.stop();

    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.blob.size).toBeGreaterThan(0);
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      robotId: 'robot-01',
      requestedSourceIds: selectedSourceIds,
      mediaFiles: [{ mimeType: 'video/webm' }],
    });
    expect(result.manifest.crops).toEqual([
      expect.objectContaining({ displayName: '좌측 전방', x: 0, y: 0, width: 1 / 3, height: 1 / 2 }),
      expect.objectContaining({ displayName: '전방', x: 1 / 3, y: 0, width: 1 / 3, height: 1 / 2 }),
      expect.objectContaining({ displayName: '우측 전방', x: 2 / 3, y: 0, width: 1 / 3, height: 1 / 2 }),
      expect.objectContaining({ displayName: '좌측 후방', x: 0, y: 1 / 2, width: 1 / 3, height: 1 / 2 }),
      expect.objectContaining({ displayName: '우측 후방', x: 2 / 3, y: 1 / 2, width: 1 / 3, height: 1 / 2 }),
    ]);
    expect(peer.close).toHaveBeenCalledOnce();
    expect(remoteStop).toHaveBeenCalledOnce();
  });

  it('서명 URL만 RequestSigner에 보유하고 AWS 원본 credential을 구성하지 않는다', async () => {
    const peer = createPeerConnection();
    const adapter = new KinesisCameraAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher: () => Promise.resolve(viewerSessionResponse()),
      createPeerConnection: () => peer.value,
      createSignalingClient: FakeSignalingClient,
      createCompositeVideoCropper: createFakeCompositeVideoCropper,
    });
    const [source] = await adapter.listSources('robot-01');
    const opening = adapter.openSource(source?.id ?? '');
    await flushPromises();

    const config = FakeSignalingClient.latest?.configuration as Record<string, unknown>;
    expect(config).not.toHaveProperty('credentials');
    expect(config).not.toHaveProperty('accessKeyId');
    expect(config).not.toHaveProperty('secretAccessKey');
    const signer = config.requestSigner as { getSignedURL(): Promise<string> };
    await expect(signer.getSignedURL()).resolves.toContain('X-Amz-Signature=signed');

    peer.receiveTrack({ id: 'video', kind: 'video', stop: vi.fn() } as unknown as MediaStreamTrack);
    const session = await opening;
    session.close();
  });

  const terminalCases = [
    ['peer disconnected', (peer: FakePeerConnection) => peer.setConnectionState('disconnected'), 'disconnected'],
    ['peer closed', (peer: FakePeerConnection) => peer.setConnectionState('closed'), 'disconnected'],
    ['peer failed', (peer: FakePeerConnection) => peer.setConnectionState('failed'), 'error'],
    ['ICE disconnected', (peer: FakePeerConnection) => peer.setIceConnectionState('disconnected'), 'disconnected'],
    ['ICE closed', (peer: FakePeerConnection) => peer.setIceConnectionState('closed'), 'disconnected'],
    ['ICE failed', (peer: FakePeerConnection) => peer.setIceConnectionState('failed'), 'error'],
    [
      'signaling close',
      (_peer: FakePeerConnection, signaling: FakeSignalingClient) => signaling.emit('close'),
      'disconnected',
    ],
    [
      'remote track ended',
      (_peer: FakePeerConnection, _signaling: FakeSignalingClient, track: MediaStreamTrack) => {
        track.onended?.(new Event('ended'));
      },
      'disconnected',
    ],
    [
      'pagehide',
      () => globalThis.dispatchEvent(new Event('pagehide')),
      'disconnected',
    ],
  ] as const;

  it.each(terminalCases)(
    '%s이면 signaling·peer·track을 즉시 한 번만 정리한다',
    async (_caseName, trigger, expectedStatus) => {
      const peer = createPeerConnection();
      const compositeCropper = createFakeCompositeCropper();
      const adapter = new KinesisCameraAdapter({
        endpoint: '/api/integrations/patrol',
        fetcher: () => Promise.resolve(viewerSessionResponse()),
        createPeerConnection: () => peer.value,
        createSignalingClient: FakeSignalingClient,
        createCompositeVideoCropper: compositeCropper.factory,
      });
      const [source] = await adapter.listSources('robot-01');
      const opening = adapter.openSource(source?.id ?? '');
      await flushPromises();
      const signaling = FakeSignalingClient.latest;
      if (signaling === null) throw new Error('Kinesis signaling client가 필요합니다.');
      const stopTrack = vi.fn();
      const track = {
        id: 'remote-video',
        kind: 'video',
        onended: null,
        stop: stopTrack,
      } as unknown as MediaStreamTrack;
      peer.receiveTrack(track);
      const session = await opening;
      peer.setConnectionState('connected');
      const statuses: string[] = [];
      session.subscribeStatus((status) => statuses.push(status));

      trigger(peer, signaling, track);
      await flushPromises();

      expect(statuses.at(-1)).toBe(expectedStatus);
      expect(peer.close).toHaveBeenCalledOnce();
      expect(signaling.close).toHaveBeenCalledOnce();
      expect(signaling.listeners.size).toBe(0);
      expect(stopTrack).toHaveBeenCalledOnce();
      expect(track.onended).toBeNull();
      expect(compositeCropper.outputStops[0]).toHaveBeenCalledOnce();
      expect(compositeCropper.close).toHaveBeenCalledOnce();

      session.close();
      expect(peer.close).toHaveBeenCalledOnce();
      expect(compositeCropper.close).toHaveBeenCalledOnce();
    },
  );

  it('연결 전 취소 신호도 대기 중 Viewer session을 즉시 정리한다', async () => {
    const peer = createPeerConnection();
    const controller = new AbortController();
    const adapter = new KinesisCameraAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher: () => Promise.resolve(viewerSessionResponse()),
      createPeerConnection: () => peer.value,
      createSignalingClient: FakeSignalingClient,
      createCompositeVideoCropper: createFakeCompositeVideoCropper,
    });
    const [source] = await adapter.listSources('robot-01');
    const opening = adapter.openSource(source?.id ?? '', controller.signal);
    const rejection = expect(opening).rejects.toThrow('연결 전에 종료');
    await flushPromises();

    controller.abort();
    await rejection;

    expect(peer.close).toHaveBeenCalledOnce();
    expect(FakeSignalingClient.latest?.close).toHaveBeenCalledOnce();
    expect(FakeSignalingClient.latest?.listeners.size).toBe(0);
  });

  it('잘못된 Viewer Session Shape를 peer 생성 전에 거절한다', async () => {
    const createPeer = vi.fn(() => createPeerConnection().value);
    const adapter = new KinesisCameraAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher: () => Promise.resolve(jsonResponse({
        clientId: 'viewer',
        channelArn: 'arn',
        region: 'ap-northeast-2',
        iceServers: [],
        signedWssUrl: 'wss://valid.example.com',
      })),
      createPeerConnection: createPeer,
      createSignalingClient: FakeSignalingClient,
      createCompositeVideoCropper: createFakeCompositeVideoCropper,
    });
    const [source] = await adapter.listSources('robot-01');

    await expect(adapter.openSource(source?.id ?? '')).rejects.toThrow('iceServers');
    expect(createPeer).not.toHaveBeenCalled();
  });

  it('remote video track 제한 시간이 지나면 연결을 거절하고 모든 자원을 닫는다', async () => {
    vi.useFakeTimers();
    const peer = createPeerConnection();
    const adapter = new KinesisCameraAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher: () => Promise.resolve(viewerSessionResponse()),
      connectionTimeoutMs: 1_000,
      createPeerConnection: () => peer.value,
      createSignalingClient: FakeSignalingClient,
      createCompositeVideoCropper: createFakeCompositeVideoCropper,
    });
    const [source] = await adapter.listSources('robot-01');
    const opening = adapter.openSource(source?.id ?? '');
    await flushPromises();

    const rejection = expect(opening).rejects.toThrow('시간이 초과');
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(peer.close).toHaveBeenCalledOnce();
    expect(FakeSignalingClient.latest?.close).toHaveBeenCalledOnce();
  });

  it('dispose가 진행 중인 session 발급을 취소하고 재사용을 막는다', async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const adapter = new KinesisCameraAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher,
      createSignalingClient: FakeSignalingClient,
      createCompositeVideoCropper: createFakeCompositeVideoCropper,
    });
    const [source] = await adapter.listSources('robot-01');
    const opening = adapter.openSource(source?.id ?? '');
    await flushPromises();

    adapter.dispose();
    adapter.dispose();

    await expect(opening).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await expect(adapter.listSources('robot-01')).rejects.toThrow('종료된 카메라 Adapter');
    await expect(adapter.openSource(source?.id ?? '')).rejects.toThrow('종료된 카메라 Adapter');
    expect(FakeSignalingClient.latest).toBeNull();
  });
});
