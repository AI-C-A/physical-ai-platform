import {
  HAND_JOINT_NAMES,
  type ActiveWebXrSession,
  type HandJointPose,
  type HandPoseObservation,
  type Handedness,
  type WebXrFrameObservation,
  type WebXrRuntimePort,
} from '../model/hand-pose';

type UnknownRecord = Readonly<Record<string, unknown>>;

interface RawXrSession extends UnknownRecord {
  readonly inputSources: Iterable<unknown>;
  requestReferenceSpace(type: string): Promise<unknown>;
  requestAnimationFrame(callback: (time: number, frame: unknown) => void): number;
  cancelAnimationFrame(handle: number): void;
  updateRenderState(state: Readonly<Record<string, unknown>>): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  end(): Promise<void>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function getFunction<TFunction extends (...args: never[]) => unknown>(
  value: unknown,
  key: string,
): TFunction | null {
  if (!isRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === 'function' ? candidate as TFunction : null;
}

function toRawSession(value: unknown): RawXrSession {
  if (!isRecord(value) || value.inputSources === null || value.inputSources === undefined) {
    throw new Error('브라우저가 올바른 XRSession을 반환하지 않았습니다.');
  }
  const requiredFunctions = [
    'requestReferenceSpace',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'updateRenderState',
    'addEventListener',
    'removeEventListener',
    'end',
  ];
  if (requiredFunctions.some((key) => getFunction(value, key) === null)) {
    throw new Error('브라우저 XRSession에 필요한 API가 없습니다.');
  }
  const iterable = value.inputSources as { readonly [Symbol.iterator]?: unknown };
  if (typeof iterable[Symbol.iterator] !== 'function') {
    throw new Error('브라우저 XR input source 목록을 읽을 수 없습니다.');
  }
  return value as RawXrSession;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readVector(
  value: unknown,
  keys: readonly string[],
): readonly number[] | null {
  if (!isRecord(value)) return null;
  const result = keys.map((key) => finiteNumber(value[key]));
  return result.every((item): item is number => item !== null) ? result : null;
}

function readJointPose(value: unknown, name: (typeof HAND_JOINT_NAMES)[number]): HandJointPose | null {
  if (!isRecord(value) || !isRecord(value.transform)) return null;
  const position = readVector(value.transform.position, ['x', 'y', 'z']);
  const orientation = readVector(value.transform.orientation, ['x', 'y', 'z', 'w']);
  if (position === null || orientation === null) return null;
  const radius = value.radius === undefined ? null : finiteNumber(value.radius);
  if (value.radius !== undefined && (radius === null || radius < 0)) return null;
  return {
    name,
    positionMeters: position as readonly [number, number, number],
    orientationQuaternion: orientation as readonly [number, number, number, number],
    radiusMeters: radius,
  };
}

function missingObservation(sourcePresent: boolean): HandPoseObservation {
  return { sourcePresent, poseObserved: false, joints: [] };
}

function observeHand(frame: unknown, hand: unknown, referenceSpace: unknown): HandPoseObservation {
  const getJoint = getFunction<(name: string) => unknown>(hand, 'get');
  const getJointPose = getFunction<(joint: unknown, baseSpace: unknown) => unknown>(frame, 'getJointPose');
  if (getJoint === null || getJointPose === null) return missingObservation(true);
  const joints: HandJointPose[] = [];
  for (const name of HAND_JOINT_NAMES) {
    const jointSpace = getJoint.call(hand, name);
    if (jointSpace === undefined || jointSpace === null) return missingObservation(true);
    const pose = readJointPose(getJointPose.call(frame, jointSpace, referenceSpace), name);
    // Hand Input Level 1은 한 손의 joint pose가 함께 유효하거나 함께 null이어야 한다.
    // 비표준 partial 구현을 만나도 원본 계약에 정상 joint처럼 섞지 않는다.
    if (pose === null) return missingObservation(true);
    joints.push(pose);
  }
  return { sourcePresent: true, poseObserved: true, joints };
}

function readFrameObservation(
  frame: unknown,
  inputSources: Iterable<unknown>,
  referenceSpace: unknown,
  deviceMonotonicTimestampMs: number,
): WebXrFrameObservation {
  const hands: Record<Handedness, HandPoseObservation> = {
    left: missingObservation(false),
    right: missingObservation(false),
  };
  for (const inputSource of inputSources) {
    if (!isRecord(inputSource)) continue;
    const handedness = inputSource.handedness;
    if (handedness !== 'left' && handedness !== 'right') continue;
    if (inputSource.hand === null || inputSource.hand === undefined) continue;
    hands[handedness] = observeHand(frame, inputSource.hand, referenceSpace);
  }
  return { deviceMonotonicTimestampMs, hands };
}

function getXrSystem(): UnknownRecord | null {
  if (typeof navigator === 'undefined') return null;
  const xr: unknown = Reflect.get(navigator, 'xr');
  return isRecord(xr) ? xr : null;
}

export class BrowserWebXrRuntime implements WebXrRuntimePort {
  readonly mode = 'webxr' as const;

  async checkSupport(): Promise<{ readonly supported: boolean; readonly secureContext: boolean; readonly detail: string }> {
    const secureContext = typeof window !== 'undefined' && window.isSecureContext;
    if (!secureContext) return { supported: false, secureContext, detail: 'WebXR에는 HTTPS secure context가 필요합니다.' };
    const xr = getXrSystem();
    const isSessionSupported = getFunction<(mode: string) => Promise<boolean>>(xr, 'isSessionSupported');
    if (xr === null || isSessionSupported === null) {
      return { supported: false, secureContext, detail: '이 브라우저에서 WebXR를 사용할 수 없습니다.' };
    }
    try {
      const supported = await isSessionSupported.call(xr, 'immersive-ar');
      return {
        supported,
        secureContext,
        detail: supported
          ? 'immersive-ar와 Hand Tracking 요청을 시작할 수 있습니다.'
          : 'immersive-ar를 지원하는 XR 장치를 찾지 못했습니다.',
      };
    } catch (reason) {
      return {
        supported: false,
        secureContext,
        detail: reason instanceof Error ? reason.message : 'WebXR 지원 여부를 확인하지 못했습니다.',
      };
    }
  }

  async start(
    onFrame: (observation: WebXrFrameObservation) => void,
    onEnded: () => void,
  ): Promise<ActiveWebXrSession> {
    // requestSession must run in the button's activation before awaiting browser capability checks.
    if (typeof window === 'undefined' || !window.isSecureContext) {
      throw new Error('WebXR에는 HTTPS secure context가 필요합니다.');
    }
    const xr = getXrSystem();
    const requestSession = getFunction<(mode: string, init: Readonly<Record<string, unknown>>) => Promise<unknown>>(xr, 'requestSession');
    if (xr === null || requestSession === null) throw new Error('WebXR session API를 사용할 수 없습니다.');

    const rawSession = await requestSession.call(xr, 'immersive-ar', {
      requiredFeatures: ['hand-tracking', 'local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body },
    });
    const session = toRawSession(rawSession);
    let canvas: HTMLCanvasElement | null = null;
    let frameHandle: number | null = null;
    let ended = false;

    const cleanup = (): void => {
      if (ended) return;
      ended = true;
      if (frameHandle !== null) session.cancelAnimationFrame(frameHandle);
      session.removeEventListener('end', handleEnded);
      canvas?.remove();
      canvas = null;
      onEnded();
    };
    const handleEnded = (): void => cleanup();

    try {
      const referenceSpace = await session.requestReferenceSpace('local-floor');
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.className = 'pointer-events-none fixed inset-0';
      document.body.append(canvas);
      const context = canvas.getContext('webgl', { alpha: true, antialias: false });
      if (context === null) throw new Error('WebXR용 WebGL context를 만들 수 없습니다.');
      const makeXrCompatible = getFunction<() => Promise<void>>(context, 'makeXRCompatible');
      if (makeXrCompatible === null) throw new Error('WebGL context가 WebXR 호환 모드를 지원하지 않습니다.');
      await makeXrCompatible.call(context);
      const layerConstructorValue: unknown = Reflect.get(globalThis, 'XRWebGLLayer');
      if (typeof layerConstructorValue !== 'function') throw new Error('XRWebGLLayer를 사용할 수 없습니다.');
      const LayerConstructor = layerConstructorValue as new (
        xrSession: RawXrSession,
        webGlContext: WebGLRenderingContext,
        options: Readonly<Record<string, unknown>>,
      ) => UnknownRecord;
      const baseLayer = new LayerConstructor(session, context, { alpha: true, depth: true });
      session.updateRenderState({ baseLayer });
      session.addEventListener('end', handleEnded);

      const renderFrame = (time: number, frame: unknown): void => {
        if (ended) return;
        context.bindFramebuffer(context.FRAMEBUFFER, baseLayer.framebuffer as WebGLFramebuffer | null);
        context.clearColor(0, 0, 0, 0);
        context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT);
        onFrame(readFrameObservation(frame, session.inputSources, referenceSpace, time));
        frameHandle = session.requestAnimationFrame(renderFrame);
      };
      frameHandle = session.requestAnimationFrame(renderFrame);
    } catch (reason) {
      await session.end().catch(() => undefined);
      cleanup();
      throw reason;
    }

    return {
      end: async () => {
        if (ended) return;
        await session.end();
        cleanup();
      },
    };
  }
}
