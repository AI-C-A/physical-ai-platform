import { afterEach, describe, expect, it, vi } from 'vitest';

import { HAND_JOINT_NAMES, type WebXrFrameObservation } from '../model/hand-pose';
import { BrowserWebXrRuntime } from './browser-webxr-runtime';

const secureContextDescriptor = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
const xrDescriptor = Object.getOwnPropertyDescriptor(navigator, 'xr');
const layerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'XRWebGLLayer');

function restoreProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, key);
  } else {
    Object.defineProperty(target, key, descriptor);
  }
}

describe('BrowserWebXrRuntime', () => {
  afterEach(() => {
    restoreProperty(window, 'isSecureContext', secureContextDescriptor);
    restoreProperty(navigator, 'xr', xrDescriptor);
    restoreProperty(globalThis, 'XRWebGLLayer', layerDescriptor);
    vi.restoreAllMocks();
    document.querySelectorAll('canvas[aria-hidden="true"]').forEach((canvas) => canvas.remove());
  });

  it('25-joint 손을 정규화하고 end에서 RAF, listener와 canvas를 정리한다', async () => {
    let animationFrame: ((time: number, frame: unknown) => void) | null = null;
    let endListener: (() => void) | null = null;
    const cancelAnimationFrame = vi.fn();
    const removeEventListener = vi.fn();
    const end = vi.fn(() => Promise.resolve());
    const hand = new Map(HAND_JOINT_NAMES.map((name) => [name, { name }]));
    const session = {
      inputSources: [{ handedness: 'left', hand }],
      requestReferenceSpace: vi.fn(() => Promise.resolve({ type: 'local-floor' })),
      requestAnimationFrame: vi.fn((callback: (time: number, frame: unknown) => void) => {
        animationFrame = callback;
        return 41;
      }),
      cancelAnimationFrame,
      updateRenderState: vi.fn(),
      addEventListener: vi.fn((_type: string, listener: () => void) => { endListener = listener; }),
      removeEventListener,
      end,
    };
    const requestSession = vi.fn(() => Promise.resolve(session));
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: { isSessionSupported: () => Promise.resolve(true), requestSession },
    });
    Object.defineProperty(globalThis, 'XRWebGLLayer', {
      configurable: true,
      value: class FakeXrWebGlLayer {},
    });
    const context = { makeXRCompatible: () => Promise.resolve() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as never,
    );
    const observations: WebXrFrameObservation[] = [];
    const onEnded = vi.fn();
    const runtime = new BrowserWebXrRuntime();

    expect(await runtime.checkSupport()).toMatchObject({ supported: true, secureContext: true });
    const active = await runtime.start((observation) => observations.push(observation), onEnded);
    expect(requestSession).toHaveBeenCalledWith('immersive-ar', {
      requiredFeatures: ['hand-tracking', 'local-floor'],
    });
    expect(session.requestReferenceSpace).toHaveBeenCalledWith('local-floor');
    expect(document.querySelector('canvas[aria-hidden="true"]')).toBeInTheDocument();

    const scheduledFrame = animationFrame as ((time: number, frame: unknown) => void) | null;
    if (scheduledFrame === null) throw new Error('WebXR animation frame이 예약되지 않았습니다.');
    scheduledFrame(123.5, {
      getJointPose: (joint: unknown) => ({
        transform: {
          position: { x: 0.1, y: 1.2, z: -0.3 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        radius: typeof joint === 'object' && joint !== null ? 0.008 : undefined,
      }),
    });
    expect(observations[0]).toMatchObject({
      deviceMonotonicTimestampMs: 123.5,
      hands: {
        left: { sourcePresent: true, poseObserved: true },
        right: { sourcePresent: false, poseObserved: false, joints: [] },
      },
    });
    expect(observations[0]?.hands.left.joints).toHaveLength(25);

    await active.end();
    expect(end).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);
    expect(removeEventListener).toHaveBeenCalledWith('end', endListener);
    expect(document.querySelector('canvas[aria-hidden="true"]')).not.toBeInTheDocument();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('한 joint pose가 null이면 그 손 전체를 누락으로 보존한다', async () => {
    let animationFrame: ((time: number, frame: unknown) => void) | null = null;
    const hand = new Map(HAND_JOINT_NAMES.map((name) => [name, { name }]));
    const session = {
      inputSources: [{ handedness: 'right', hand }],
      requestReferenceSpace: () => Promise.resolve({ type: 'local-floor' }),
      requestAnimationFrame: (callback: (time: number, frame: unknown) => void) => {
        animationFrame = callback;
        return 7;
      },
      cancelAnimationFrame: () => undefined,
      updateRenderState: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      end: () => Promise.resolve(),
    };
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: {
        isSessionSupported: () => Promise.resolve(true),
        requestSession: () => Promise.resolve(session),
      },
    });
    Object.defineProperty(globalThis, 'XRWebGLLayer', {
      configurable: true,
      value: class FakeXrWebGlLayer {},
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      { makeXRCompatible: () => Promise.resolve() } as never,
    );
    const observations: WebXrFrameObservation[] = [];
    const active = await new BrowserWebXrRuntime().start(
      (observation) => observations.push(observation),
      () => undefined,
    );
    const scheduledFrame = animationFrame as ((time: number, frame: unknown) => void) | null;
    if (scheduledFrame === null) throw new Error('WebXR animation frame이 예약되지 않았습니다.');
    scheduledFrame(10, {
      getJointPose: (joint: unknown) => (
        typeof joint === 'object' && joint !== null && 'name' in joint && joint.name === 'pinky-finger-tip'
          ? null
          : {
            transform: {
              position: { x: 0, y: 0, z: 0 },
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            },
            radius: 0.008,
          }
      ),
    });
    expect(observations[0]?.hands.right).toEqual({
      sourcePresent: true,
      poseObserved: false,
      joints: [],
    });
    await active.end();
  });
});
