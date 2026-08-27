import 'amazon-kinesis-video-streams-webrtc/dist/kvs-webrtc.min.js';

import { requestJson, resolveSameOriginEndpoint } from '@/shared/lib/http-json';

import type {
  RobotVideoPort,
  RobotVideoRecordingManifest,
  RobotVideoRecordingRequest,
  RobotVideoRecordingResult,
  RobotVideoRecordingSession,
  RobotVideoSession,
  RobotVideoSource,
  VideoConnectionStatus,
} from '../model/robot-video';
import {
  createCompositeGridVideoCropper,
  type CompositeGridCrop,
  type CompositeGridVideoCropper,
  type CompositeGridVideoCropperFactory,
  type CroppedVideoOutput,
} from './composite-grid-video';

type ExternalFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface KinesisViewerSessionConfig {
  readonly clientId: string;
  readonly channelArn: string;
  readonly region: string;
  readonly iceServers: readonly RTCIceServer[];
  readonly signedWssUrl: string;
  readonly unsignedWssEndpoint: string;
}

interface KinesisVideoAdapterOptions {
  readonly endpoint: string;
  readonly fetcher?: ExternalFetcher;
  readonly connectionTimeoutMs?: number;
  readonly createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
  readonly createSignalingClient?: KinesisSignalingClientConstructor;
  readonly createCompositeVideoCropper?: CompositeGridVideoCropperFactory;
  readonly createMediaRecorder?: (
    stream: MediaStream,
    options?: MediaRecorderOptions,
  ) => MediaRecorder;
  readonly nowMs?: () => number;
}

interface CompositeCameraSlot {
  readonly crop: CompositeGridCrop;
  readonly displayName: string;
  readonly key: string;
}

interface RegisteredCameraSource {
  readonly slot: CompositeCameraSlot;
  readonly source: RobotVideoSource;
}

const compositeCameraSlots = [
  {
    crop: { column: 0, columns: 3, row: 0, rows: 2 },
    displayName: '좌측 전방',
    key: 'grid-r1-c1',
  },
  {
    crop: { column: 1, columns: 3, row: 0, rows: 2 },
    displayName: '전방',
    key: 'grid-r1-c2',
  },
  {
    crop: { column: 2, columns: 3, row: 0, rows: 2 },
    displayName: '우측 전방',
    key: 'grid-r1-c3',
  },
  {
    crop: { column: 0, columns: 3, row: 1, rows: 2 },
    displayName: '좌측 후방',
    key: 'grid-r2-c1',
  },
  {
    crop: { column: 2, columns: 3, row: 1, rows: 2 },
    displayName: '우측 후방',
    key: 'grid-r2-c3',
  },
] as const satisfies readonly CompositeCameraSlot[];

interface KinesisSignalingClient {
  addListener(eventName: string, listener: (...args: unknown[]) => void): this;
  drainPendingIceCandidates(): void;
  open(): void;
  close(): void;
  removeAllListeners(): this;
  sendIceCandidate(candidate: RTCIceCandidate): void;
  sendSdpOffer(offer: RTCSessionDescription): void;
}

interface KinesisRequestSigner {
  getSignedURL(): Promise<string>;
}

interface KinesisSignalingClientConfig {
  readonly role: 'VIEWER';
  readonly channelARN: string;
  readonly channelEndpoint: string;
  readonly clientId: string;
  readonly region: string;
  readonly requestSigner: KinesisRequestSigner;
  readonly enableEarlyIceCandidateBuffering: true;
}

type KinesisSignalingClientConstructor = new (
  configuration: KinesisSignalingClientConfig,
) => KinesisSignalingClient;

interface KinesisBrowserSdk {
  readonly SignalingClient: KinesisSignalingClientConstructor;
}

function getBrowserKinesisSdk(): KinesisBrowserSdk {
  const candidate = (globalThis as typeof globalThis & {
    readonly KVSWebRTC?: KinesisBrowserSdk;
  }).KVSWebRTC;
  if (candidate === undefined) {
    throw new Error('Kinesis WebRTC 브라우저 SDK를 초기화하지 못했습니다.');
  }
  return candidate;
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} 응답은 객체여야 합니다.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} 값은 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value.trim();
}

function requireSdpString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} 값은 비어 있지 않은 문자열이어야 합니다.`);
  }
  // SDP의 마지막 CRLF도 문법의 일부이므로 검증 후 원문을 그대로 전달한다.
  return value;
}

function parseIceServers(value: unknown): readonly RTCIceServer[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('카메라 Viewer Session.iceServers는 비어 있지 않은 배열이어야 합니다.');
  }
  return value.map((item, index) => {
    const record = requireRecord(item, `iceServers[${String(index)}]`);
    const urls = Array.isArray(record.urls)
      ? record.urls.map((url, urlIndex) => requireString(
          url,
          `iceServers[${String(index)}].urls[${String(urlIndex)}]`,
        ))
      : requireString(record.urls, `iceServers[${String(index)}].urls`);
    const username = record.username === undefined
      ? undefined
      : requireString(record.username, `iceServers[${String(index)}].username`);
    const credential = record.credential === undefined
      ? undefined
      : requireString(record.credential, `iceServers[${String(index)}].credential`);
    return {
      urls,
      ...(username === undefined ? {} : { username }),
      ...(credential === undefined ? {} : { credential }),
    };
  });
}

function parseViewerSession(value: unknown): KinesisViewerSessionConfig {
  const record = requireRecord(value, '카메라 Viewer Session');
  const signedWssUrl = requireString(record.signedWssUrl, '카메라 Viewer Session.signedWssUrl');
  let signedUrl;
  try {
    signedUrl = new URL(signedWssUrl);
  } catch (error: unknown) {
    throw new Error('카메라 Viewer Session.signedWssUrl이 유효하지 않습니다.', { cause: error });
  }
  if (signedUrl.protocol !== 'wss:') {
    throw new Error('카메라 Viewer Session.signedWssUrl은 WSS URL이어야 합니다.');
  }
  signedUrl.search = '';
  signedUrl.hash = '';
  return {
    clientId: requireString(record.clientId, '카메라 Viewer Session.clientId'),
    channelArn: requireString(record.channelArn, '카메라 Viewer Session.channelArn'),
    region: requireString(record.region, '카메라 Viewer Session.region'),
    iceServers: parseIceServers(record.iceServers),
    signedWssUrl,
    unsignedWssEndpoint: signedUrl.href,
  };
}

function parseSdpAnswer(value: unknown): RTCSessionDescriptionInit {
  const record = requireRecord(value, 'Kinesis SDP answer');
  if (record.type !== 'answer') throw new Error('Kinesis SDP 응답 type이 answer가 아닙니다.');
  return {
    type: 'answer',
    sdp: requireSdpString(record.sdp, 'Kinesis SDP answer.sdp'),
  };
}

function parseIceCandidate(value: unknown): RTCIceCandidateInit {
  const record = requireRecord(value, 'Kinesis ICE candidate');
  return {
    candidate: requireString(record.candidate, 'Kinesis ICE candidate.candidate'),
    ...(record.sdpMid === null || typeof record.sdpMid === 'string'
      ? { sdpMid: record.sdpMid }
      : {}),
    ...(typeof record.sdpMLineIndex === 'number'
      ? { sdpMLineIndex: record.sdpMLineIndex }
      : {}),
    ...(typeof record.usernameFragment === 'string'
      ? { usernameFragment: record.usernameFragment }
      : {}),
  };
}

function createEndpoint(base: URL, path: string): URL {
  const normalizedBase = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  return new URL(`${normalizedBase}${path}`, base.origin);
}

function createAbortError(): DOMException {
  return new DOMException('카메라 session이 연결 전에 종료되었습니다.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw createAbortError();
}

function getRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function sanitizeFileSegment(value: string): string {
  const sanitized = value.trim().replace(/[^\p{L}\p{N}._-]+/gu, '-');
  return sanitized.length === 0 ? 'robot' : sanitized;
}

function createRecordingBaseName(robotId: string, startedAtMs: number): string {
  const timestamp = new Date(startedAtMs).toISOString().replace(/[:.]/gu, '-');
  return `${sanitizeFileSegment(robotId)}-${timestamp}-camera-original`;
}

function waitWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', handleAbort);
      callback();
    };
    const handleAbort = (): void => finish(() => reject(createAbortError()));
    signal.addEventListener('abort', handleAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(
        error instanceof Error
          ? error
          : new Error('카메라 연결 중 알 수 없는 오류가 발생했습니다.'),
      )),
    );
  });
}

class FixedSignedUrlRequestSigner implements KinesisRequestSigner {
  readonly #signedUrl: string;

  constructor(signedUrl: string) {
    this.#signedUrl = signedUrl;
  }

  getSignedURL(): Promise<string> {
    return Promise.resolve(this.#signedUrl);
  }
}

class KinesisCameraSession implements RobotVideoSession {
  readonly mediaStream = new MediaStream();
  readonly #listeners = new Set<(status: VideoConnectionStatus) => void>();
  readonly #onRelease: (session: KinesisCameraSession) => void;
  #cleanup: (() => void) | null = null;
  #status: VideoConnectionStatus = 'connecting';
  #released = false;

  constructor(onRelease: (session: KinesisCameraSession) => void) {
    this.#onRelease = onRelease;
  }

  subscribeStatus(listener: (status: VideoConnectionStatus) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#status);
    return () => this.#listeners.delete(listener);
  }

  attachCleanup(cleanup: () => void): void {
    if (this.#released) cleanup();
    else this.#cleanup = cleanup;
  }

  addVideoTrack(track: MediaStreamTrack): void {
    if (this.#released || track.kind !== 'video') return;
    if (!this.mediaStream.getVideoTracks().some((item) => item.id === track.id)) {
      this.mediaStream.addTrack(track);
    }
  }

  setStatus(status: VideoConnectionStatus): void {
    if (this.#released) return;
    this.#status = status;
    [...this.#listeners].forEach((listener) => {
      try {
        listener(status);
      } catch {
        // 한 UI listener의 오류가 연결 생명주기를 막지 않는다.
      }
    });
  }

  fail(): void {
    if (this.#released) return;
    this.setStatus('error');
    this.#release(true);
  }

  close(): void {
    if (this.#released) return;
    this.setStatus('disconnected');
    this.#release(true);
  }

  #release(clearListeners: boolean): void {
    if (this.#released) return;
    this.#released = true;
    try {
      this.#cleanup?.();
    } finally {
      this.#cleanup = null;
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // 하나의 비정상 track이 나머지 자원 정리를 막지 않는다.
        }
      });
      if (clearListeners) this.#listeners.clear();
      this.#onRelease(this);
    }
  }
}

class CroppedCameraSession implements RobotVideoSession {
  readonly mediaStream: MediaStream;
  readonly #listeners = new Set<(status: VideoConnectionStatus) => void>();
  readonly #output: CroppedVideoOutput;
  readonly #onRelease: (session: CroppedCameraSession) => void;
  readonly #unsubscribeUpstream: () => void;
  #status: VideoConnectionStatus = 'connecting';
  #released = false;

  constructor(
    output: CroppedVideoOutput,
    upstream: KinesisCameraSession,
    onRelease: (session: CroppedCameraSession) => void,
  ) {
    this.mediaStream = output.mediaStream;
    this.#output = output;
    this.#onRelease = onRelease;
    this.#unsubscribeUpstream = upstream.subscribeStatus((status) => this.#setStatus(status));
  }

  subscribeStatus(listener: (status: VideoConnectionStatus) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#status);
    return () => this.#listeners.delete(listener);
  }

  close(): void {
    this.#release(true);
  }

  terminate(status?: VideoConnectionStatus): void {
    if (status !== undefined) this.#setStatus(status);
    this.#release(false);
  }

  #setStatus(status: VideoConnectionStatus): void {
    if (this.#released) return;
    this.#status = status;
    [...this.#listeners].forEach((listener) => {
      try {
        listener(status);
      } catch {
        // 한 UI listener의 오류가 다른 분할 영상의 상태 전달을 막지 않는다.
      }
    });
  }

  #release(notifyDisconnected: boolean): void {
    if (this.#released) return;
    if (notifyDisconnected && this.#status !== 'error') this.#setStatus('disconnected');
    this.#released = true;
    try {
      this.#unsubscribeUpstream();
    } finally {
      try {
        this.#output.close();
      } finally {
        this.#listeners.clear();
        this.#onRelease(this);
      }
    }
  }
}

class SharedCompositeCameraFeed {
  readonly #upstream: KinesisCameraSession;
  readonly #cropper: CompositeGridVideoCropper;
  readonly #sessions = new Set<CroppedCameraSession>();
  readonly #unsubscribeUpstream: () => void;
  #closed = false;

  constructor(
    upstream: KinesisCameraSession,
    cropper: CompositeGridVideoCropper,
  ) {
    this.#upstream = upstream;
    this.#cropper = cropper;
    this.#unsubscribeUpstream = upstream.subscribeStatus((status) => {
      if (status !== 'disconnected' && status !== 'error') return;
      globalThis.queueMicrotask(() => this.close());
    });
  }

  get mediaStream(): MediaStream {
    return this.#upstream.mediaStream;
  }

  openCrop(
    crop: CompositeGridCrop,
    onRelease: () => void,
  ): RobotVideoSession {
    if (this.#closed) throw new Error('종료된 합성 카메라 연결은 사용할 수 없습니다.');
    const output = this.#cropper.openCrop(crop);
    const session = new CroppedCameraSession(
      output,
      this.#upstream,
      (released) => {
        this.#sessions.delete(released);
        onRelease();
      },
    );
    this.#sessions.add(session);
    return session;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    [...this.#sessions].forEach((session) => session.terminate());
    this.#sessions.clear();
    try {
      this.#unsubscribeUpstream();
    } finally {
      try {
        this.#cropper.close();
      } finally {
        this.#upstream.close();
      }
    }
  }
}

class CompositeCameraRecordingSession implements RobotVideoRecordingSession {
  readonly #recorder: MediaRecorder;
  readonly #request: RobotVideoRecordingRequest;
  readonly #sources: readonly RegisteredCameraSource[];
  readonly #startedAtMs: number;
  readonly #nowMs: () => number;
  readonly #onRelease: () => void;
  readonly #chunks: Blob[] = [];
  readonly #signal: AbortSignal | undefined;
  #cancelled = false;
  #released = false;
  #result: RobotVideoRecordingResult | null = null;
  #terminalError: Error | null = null;
  #stopPromise: Promise<RobotVideoRecordingResult> | null = null;
  #resolveStop: ((result: RobotVideoRecordingResult) => void) | null = null;
  #rejectStop: ((error: Error) => void) | null = null;

  constructor(options: {
    readonly recorder: MediaRecorder;
    readonly request: RobotVideoRecordingRequest;
    readonly sources: readonly RegisteredCameraSource[];
    readonly startedAtMs: number;
    readonly nowMs: () => number;
    readonly onRelease: () => void;
    readonly signal?: AbortSignal;
  }) {
    this.#recorder = options.recorder;
    this.#request = options.request;
    this.#sources = options.sources;
    this.#startedAtMs = options.startedAtMs;
    this.#nowMs = options.nowMs;
    this.#onRelease = options.onRelease;
    this.#signal = options.signal;
    this.#recorder.ondataavailable = (event) => {
      if (!this.#cancelled && event.data.size > 0) this.#chunks.push(event.data);
    };
    this.#recorder.onerror = () => {
      this.#fail(new Error('카메라 원본 녹화 중 브라우저 인코더 오류가 발생했습니다.'));
    };
    this.#recorder.onstop = () => this.#finish();
    this.#signal?.addEventListener('abort', this.#handleAbort, { once: true });

    try {
      // 짧은 chunk 주기는 중지 시 마지막 데이터 유실 범위를 제한한다.
      this.#recorder.start(1_000);
    } catch (error: unknown) {
      this.#release();
      throw new Error('카메라 원본 녹화를 시작하지 못했습니다.', { cause: error });
    }
  }

  stop(): Promise<RobotVideoRecordingResult> {
    if (this.#cancelled) {
      return Promise.reject(new Error('취소된 카메라 녹화는 마감할 수 없습니다.'));
    }
    if (this.#result !== null) return Promise.resolve(this.#result);
    if (this.#terminalError !== null) return Promise.reject(this.#terminalError);
    if (this.#stopPromise !== null) return this.#stopPromise;

    this.#stopPromise = new Promise((resolve, reject) => {
      this.#resolveStop = resolve;
      this.#rejectStop = reject;
    });
    if (this.#recorder.state !== 'inactive') {
      try {
        this.#recorder.stop();
      } catch (error: unknown) {
        this.#fail(new Error('카메라 원본 녹화를 마감하지 못했습니다.', { cause: error }));
      }
    }
    return this.#stopPromise;
  }

  cancel(): void {
    if (this.#cancelled || this.#result !== null || this.#terminalError !== null) return;
    this.#cancelled = true;
    this.#chunks.length = 0;
    if (this.#recorder.state === 'inactive') this.#release();
    else {
      try {
        this.#recorder.stop();
      } catch {
        this.#release();
      }
    }
  }

  #handleAbort = (): void => this.cancel();

  #finish(): void {
    if (this.#released) return;
    if (this.#cancelled) {
      this.#release();
      return;
    }
    const stoppedAtMs = this.#nowMs();
    const mimeType = this.#recorder.mimeType || this.#chunks[0]?.type || 'video/webm';
    const baseName = createRecordingBaseName(this.#request.robotId, this.#startedAtMs);
    const mediaFileName = `${baseName}.webm`;
    const manifest: RobotVideoRecordingManifest = {
      schemaVersion: 1,
      robotId: this.#request.robotId,
      startedAtMs: this.#startedAtMs,
      stoppedAtMs,
      requestedSourceIds: [...this.#request.sourceIds],
      crops: this.#sources.map(({ slot, source }) => ({
        sourceId: source.id,
        displayName: source.displayName,
        x: slot.crop.column / slot.crop.columns,
        y: slot.crop.row / slot.crop.rows,
        width: 1 / slot.crop.columns,
        height: 1 / slot.crop.rows,
      })),
      mediaFiles: [{ fileName: mediaFileName, mimeType }],
    };
    this.#result = {
      artifacts: [{
        blob: new Blob(this.#chunks, { type: mimeType }),
        fileName: mediaFileName,
        mimeType,
      }],
      manifest,
      manifestFileName: `${baseName}.json`,
    };
    this.#chunks.length = 0;
    this.#resolveStop?.(this.#result);
    this.#release();
  }

  #fail(error: Error): void {
    if (this.#released) return;
    this.#terminalError = error;
    this.#rejectStop?.(error);
    this.#release();
  }

  #release(): void {
    if (this.#released) return;
    this.#released = true;
    this.#signal?.removeEventListener('abort', this.#handleAbort);
    this.#recorder.ondataavailable = null;
    this.#recorder.onerror = null;
    this.#recorder.onstop = null;
    this.#resolveStop = null;
    this.#rejectStop = null;
    this.#onRelease();
  }
}

interface SharedFeedEntry {
  readonly controller: AbortController;
  feed: SharedCompositeCameraFeed | null;
  promise: Promise<SharedCompositeCameraFeed> | null;
  users: number;
}

/**
 * Robot별 Kinesis Viewer 연결 하나를 공유하고 합성 영상의 각 source를 독립 MediaStream으로 제공한다.
 * 마지막 호출자가 연결을 닫거나 adapter를 dispose하면 signaling, peer, crop track, recorder를 정리한다.
 */
export class KinesisCameraAdapter implements RobotVideoPort {
  readonly recording = {
    startRecording: (request: RobotVideoRecordingRequest, signal?: AbortSignal) =>
      this.#startRecording(request, signal),
  };
  readonly #base: URL;
  readonly #fetcher: ExternalFetcher | undefined;
  readonly #connectionTimeoutMs: number;
  readonly #createPeerConnection: (configuration: RTCConfiguration) => RTCPeerConnection;
  readonly #createCompositeVideoCropper: CompositeGridVideoCropperFactory;
  readonly #createMediaRecorder: (
    stream: MediaStream,
    options?: MediaRecorderOptions,
  ) => MediaRecorder;
  readonly #nowMs: () => number;
  readonly #SignalingClient: KinesisSignalingClientConstructor;
  readonly #sources = new Map<string, RegisteredCameraSource>();
  readonly #feedEntries = new Map<string, SharedFeedEntry>();
  readonly #sessions = new Set<KinesisCameraSession>();
  readonly #pendingControllers = new Set<AbortController>();
  readonly #recordingRobots = new Set<string>();
  readonly #recordingSessions = new Set<RobotVideoRecordingSession>();
  #disposed = false;

  constructor(options: KinesisVideoAdapterOptions) {
    this.#base = resolveSameOriginEndpoint(options.endpoint);
    this.#fetcher = options.fetcher;
    this.#connectionTimeoutMs = options.connectionTimeoutMs ?? 20_000;
    if (!Number.isFinite(this.#connectionTimeoutMs) || this.#connectionTimeoutMs <= 0) {
      throw new Error('카메라 연결 제한 시간은 0보다 큰 유한한 값이어야 합니다.');
    }
    this.#createPeerConnection = options.createPeerConnection
      ?? ((configuration) => new RTCPeerConnection(configuration));
    this.#createCompositeVideoCropper = options.createCompositeVideoCropper
      ?? ((sourceStream, signal) => createCompositeGridVideoCropper(sourceStream, {
        initializationTimeoutMs: this.#connectionTimeoutMs,
        ...(signal === undefined ? {} : { signal }),
      }));
    this.#createMediaRecorder = options.createMediaRecorder
      ?? ((stream, recorderOptions) => {
        if (typeof MediaRecorder === 'undefined') {
          throw new Error('현재 브라우저가 카메라 원본 녹화를 지원하지 않습니다.');
        }
        return new MediaRecorder(stream, recorderOptions);
      });
    this.#nowMs = options.nowMs ?? Date.now;
    this.#SignalingClient = options.createSignalingClient
      ?? getBrowserKinesisSdk().SignalingClient;
  }

  listSources(robotId: string): Promise<readonly RobotVideoSource[]> {
    return Promise.resolve().then(() => {
      this.#assertActive();
      return this.#registerSources(robotId).map(({ source }) => source);
    });
  }

  #registerSources(robotId: string): readonly RegisteredCameraSource[] {
    return compositeCameraSlots.map((slot) => {
      const source = {
        id: `${encodeURIComponent(robotId)}:patrol-camera:${slot.key}`,
        robotId,
        displayName: slot.displayName,
      } satisfies RobotVideoSource;
      const registered = { slot, source } satisfies RegisteredCameraSource;
      this.#sources.set(source.id, registered);
      return registered;
    });
  }

  async #startRecording(
    request: RobotVideoRecordingRequest,
    signal?: AbortSignal,
  ): Promise<RobotVideoRecordingSession> {
    this.#assertActive();
    throwIfAborted(signal);
    if (request.sourceIds.length === 0) {
      throw new Error('녹화할 카메라 source를 하나 이상 선택해야 합니다.');
    }
    if (this.#recordingRobots.has(request.robotId)) {
      throw new Error('같은 로봇의 카메라 원본을 이미 녹화하고 있습니다.');
    }
    const registeredSources = this.#registerSources(request.robotId);
    const availableSourceIds = new Set(registeredSources.map(({ source }) => source.id));
    const invalidSourceId = request.sourceIds.find((sourceId) => !availableSourceIds.has(sourceId));
    if (invalidSourceId !== undefined) {
      throw new Error(`녹화할 카메라 source를 찾을 수 없습니다: ${invalidSourceId}`);
    }
    this.#recordingRobots.add(request.robotId);
    const entry = this.#acquireFeed(request.robotId);
    try {
      if (entry.promise === null) throw new Error('카메라 공유 연결을 초기화하지 못했습니다.');
      const feed = await waitWithAbort(entry.promise, signal);
      this.#assertActive();
      throwIfAborted(signal);
      const mimeType = getRecordingMimeType();
      const recorder = this.#createMediaRecorder(
        feed.mediaStream,
        mimeType === undefined ? undefined : { mimeType },
      );
      const startedAtMs = this.#nowMs();
      let session: RobotVideoRecordingSession | null = null;
      const release = (): void => {
        this.#recordingRobots.delete(request.robotId);
        if (session !== null) this.#recordingSessions.delete(session);
        this.#releaseFeed(entry, request.robotId);
      };
      session = new CompositeCameraRecordingSession({
        recorder,
        request: { ...request, sourceIds: [...request.sourceIds] },
        sources: registeredSources,
        startedAtMs,
        nowMs: this.#nowMs,
        onRelease: release,
        ...(signal === undefined ? {} : { signal }),
      });
      this.#recordingSessions.add(session);
      return session;
    } catch (error: unknown) {
      this.#recordingRobots.delete(request.robotId);
      this.#releaseFeed(entry, request.robotId);
      throw error;
    }
  }

  async openSource(sourceId: string, signal?: AbortSignal): Promise<RobotVideoSession> {
    this.#assertActive();
    throwIfAborted(signal);
    const registered = this.#sources.get(sourceId);
    if (registered === undefined) throw new Error('등록된 카메라 source를 찾지 못했습니다.');
    const entry = this.#acquireFeed(registered.source.robotId);
    try {
      if (entry.promise === null) {
        throw new Error('카메라 공유 연결을 초기화하지 못했습니다.');
      }
      const feed = await waitWithAbort(entry.promise, signal);
      this.#assertActive();
      throwIfAborted(signal);
      return feed.openCrop(
        registered.slot.crop,
        () => this.#releaseFeed(entry, registered.source.robotId),
      );
    } catch (error: unknown) {
      this.#releaseFeed(entry, registered.source.robotId);
      throw error;
    }
  }

  #acquireFeed(robotId: string): SharedFeedEntry {
    const existing = this.#feedEntries.get(robotId);
    if (existing !== undefined) {
      existing.users += 1;
      return existing;
    }

    const controller = new AbortController();
    const entry: SharedFeedEntry = {
      controller,
      feed: null,
      promise: null,
      users: 1,
    };
    entry.promise = this.#createSharedFeed(robotId, controller.signal).then((feed) => {
      entry.feed = feed;
      if (
        entry.users === 0
        || this.#disposed
        || this.#feedEntries.get(robotId) !== entry
      ) {
        feed.close();
        throw createAbortError();
      }
      return feed;
    }).catch((error: unknown) => {
      if (this.#feedEntries.get(robotId) === entry) this.#feedEntries.delete(robotId);
      throw error;
    });
    this.#feedEntries.set(robotId, entry);
    return entry;
  }

  #releaseFeed(entry: SharedFeedEntry, robotId: string): void {
    if (entry.users === 0) return;
    entry.users -= 1;
    if (entry.users > 0) return;
    if (this.#feedEntries.get(robotId) === entry) this.#feedEntries.delete(robotId);
    entry.controller.abort();
    entry.feed?.close();
  }

  async #createSharedFeed(
    robotId: string,
    signal: AbortSignal,
  ): Promise<SharedCompositeCameraFeed> {
    const viewerConfig = await this.#requestViewerConfig(robotId, signal);
    this.#assertActive();
    throwIfAborted(signal);
    const upstream = await this.#connect(viewerConfig, signal);
    try {
      const cropper = await this.#createCompositeVideoCropper(upstream.mediaStream, signal);
      this.#assertActive();
      throwIfAborted(signal);
      return new SharedCompositeCameraFeed(upstream, cropper);
    } catch (error: unknown) {
      upstream.close();
      throw error;
    }
  }

  async #requestViewerConfig(
    robotId: string,
    signal: AbortSignal,
  ): Promise<KinesisViewerSessionConfig> {
    const controller = new AbortController();
    const abortRequest = (): void => controller.abort();
    if (signal.aborted) abortRequest();
    else signal.addEventListener('abort', abortRequest, { once: true });
    this.#pendingControllers.add(controller);
    try {
      return parseViewerSession(await requestJson(
        createEndpoint(
          this.#base,
          `robots/${encodeURIComponent(robotId)}/camera-viewer-session`,
        ),
        { method: 'POST', signal: controller.signal },
        this.#fetcher,
      ));
    } finally {
      this.#pendingControllers.delete(controller);
      signal.removeEventListener('abort', abortRequest);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    [...this.#feedEntries.values()].forEach((entry) => {
      entry.users = 0;
      entry.controller.abort();
      entry.feed?.close();
    });
    this.#feedEntries.clear();
    this.#pendingControllers.forEach((controller) => controller.abort());
    this.#pendingControllers.clear();
    [...this.#recordingSessions].forEach((session) => session.cancel());
    this.#recordingSessions.clear();
    this.#recordingRobots.clear();
    [...this.#sessions].forEach((session) => session.close());
    this.#sessions.clear();
    this.#sources.clear();
  }

  #connect(
    config: KinesisViewerSessionConfig,
    signal: AbortSignal | undefined,
  ): Promise<KinesisCameraSession> {
    const session = new KinesisCameraSession((released) => {
      this.#sessions.delete(released);
    });
    this.#sessions.add(session);
    const peerConnection = this.#createPeerConnection({ iceServers: [...config.iceServers] });
    peerConnection.addTransceiver('video', { direction: 'recvonly' });
    const signalingClient = new this.#SignalingClient({
      role: 'VIEWER',
      channelARN: config.channelArn,
      channelEndpoint: config.unsignedWssEndpoint,
      clientId: config.clientId,
      region: config.region,
      requestSigner: new FixedSignedUrlRequestSigner(config.signedWssUrl),
      enableEarlyIceCandidateBuffering: true,
    });
    let settled = false;
    let closing = false;
    let resolveSession: (value: KinesisCameraSession) => void;
    let rejectSession: (reason: Error) => void;
    const result = new Promise<KinesisCameraSession>((resolve, reject) => {
      resolveSession = resolve;
      rejectSession = reject;
    });
    const fail = (error: unknown): void => {
      const normalized = error instanceof Error
        ? error
        : new Error('카메라 연결 중 알 수 없는 오류가 발생했습니다.');
      if (!settled) {
        settled = true;
        rejectSession(normalized);
      }
      session.fail();
    };
    const timeoutId = globalThis.setTimeout(() => {
      fail(new Error('카메라 영상 track을 기다리는 시간이 초과되었습니다.'));
    }, this.#connectionTimeoutMs);
    const closeSession = (): void => session.close();
    const abortSession = (): void => {
      if (!settled) {
        settled = true;
        rejectSession(createAbortError());
      }
      session.close();
    };

    session.attachCleanup(() => {
      closing = true;
      if (!settled) {
        settled = true;
        rejectSession(new Error('카메라 session이 연결 전에 종료되었습니다.'));
      }
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortSession);
      globalThis.removeEventListener('pagehide', closeSession);
      signalingClient.removeAllListeners();
      try {
        signalingClient.close();
      } catch {
        // 이미 닫힌 signaling 연결의 오류는 무시한다.
      }
      peerConnection.onicecandidate = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      session.mediaStream.getTracks().forEach((track) => {
        track.onended = null;
      });
      try {
        peerConnection.close();
      } catch {
        // 이미 닫힌 peer 연결의 오류는 무시한다.
      }
    });

    if (signal?.aborted === true) {
      abortSession();
      return result;
    }
    signal?.addEventListener('abort', abortSession, { once: true });
    globalThis.addEventListener('pagehide', closeSession, { once: true });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate === null || closing) return;
      try {
        signalingClient.sendIceCandidate(event.candidate);
      } catch (error: unknown) {
        fail(error);
      }
    };
    peerConnection.ontrack = (event) => {
      if (closing || event.track.kind !== 'video') return;
      event.track.onended = closeSession;
      session.addVideoTrack(event.track);
      if (!settled) {
        settled = true;
        globalThis.clearTimeout(timeoutId);
        resolveSession(session);
      }
    };
    peerConnection.onconnectionstatechange = () => {
      if (closing) return;
      if (peerConnection.connectionState === 'connected') session.setStatus('connected');
      else if (peerConnection.connectionState === 'failed') fail(new Error('카메라 peer 연결에 실패했습니다.'));
      else if (
        peerConnection.connectionState === 'disconnected'
        || peerConnection.connectionState === 'closed'
      ) closeSession();
      else if (peerConnection.connectionState === 'connecting') session.setStatus('connecting');
    };
    peerConnection.oniceconnectionstatechange = () => {
      if (closing) return;
      if (peerConnection.iceConnectionState === 'failed') {
        fail(new Error('카메라 ICE 연결에 실패했습니다.'));
      } else if (
        peerConnection.iceConnectionState === 'disconnected'
        || peerConnection.iceConnectionState === 'closed'
      ) closeSession();
    };
    signalingClient.addListener('open', () => {
      void (async () => {
        if (closing) return;
        const offer = await peerConnection.createOffer();
        if (closing) return;
        await peerConnection.setLocalDescription(offer);
        if (closing) return;
        if (peerConnection.localDescription === null) {
          throw new Error('카메라 SDP offer를 만들지 못했습니다.');
        }
        signalingClient.sendSdpOffer(peerConnection.localDescription);
      })().catch(fail);
    });
    signalingClient.addListener('sdpAnswer', (answer: unknown) => {
      void Promise.resolve().then(async () => {
        await peerConnection.setRemoteDescription(parseSdpAnswer(answer));
        if (!closing) signalingClient.drainPendingIceCandidates();
      }).catch(fail);
    });
    signalingClient.addListener('iceCandidate', (candidate: unknown) => {
      void Promise.resolve().then(
        () => peerConnection.addIceCandidate(parseIceCandidate(candidate)),
      ).catch(fail);
    });
    signalingClient.addListener('error', fail);
    signalingClient.addListener('close', () => {
      if (!closing) closeSession();
    });
    try {
      if (!closing) signalingClient.open();
    } catch (error: unknown) {
      fail(error);
    }
    return result;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('종료된 카메라 Adapter는 사용할 수 없습니다.');
  }
}
