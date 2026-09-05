import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import { $scene } from '@google/model-viewer/lib/model-viewer-base.js';

export type ModelViewerNodePose = {
  readonly name: string;
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
} | {
  readonly name: string;
  readonly reset: true;
};

interface OriginalNodeTransform {
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
}

interface SceneVector3 {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): void;
}

interface SceneQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  set(x: number, y: number, z: number, w: number): void;
  setFromUnitVectors(from: Readonly<{ x: number; y: number; z: number }>, to: Readonly<{ x: number; y: number; z: number }>): void;
}

interface SceneNode {
  readonly position: SceneVector3;
  readonly quaternion: SceneQuaternion;
  readonly scale: SceneVector3;
}

interface InternalModelScene {
  readonly target: { getObjectByName(name: string): SceneNode | undefined };
  queueRender(): void;
}

const originalNodeTransforms = new WeakMap<object, OriginalNodeTransform>();
const nodeForward = { x: 0, y: 0, z: 1 } as const;

function applyNodePoses(modelViewer: ModelViewerElement, poses: readonly ModelViewerNodePose[]): void {
  const scene = (modelViewer as ModelViewerElement & { readonly [$scene]: InternalModelScene })[$scene];
  if (scene === undefined) return;
  poses.forEach((pose) => {
    const node = scene.target.getObjectByName(pose.name);
    if (node === undefined) return;
    let original = originalNodeTransforms.get(node);
    if (original === undefined) {
      original = {
        position: [node.position.x, node.position.y, node.position.z],
        quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w],
        scale: [node.scale.x, node.scale.y, node.scale.z],
      };
      originalNodeTransforms.set(node, original);
    }
    if ('reset' in pose) {
      node.position.set(...original.position);
      node.quaternion.set(...original.quaternion);
      node.scale.set(...original.scale);
      return;
    }
    const direction = {
      x: pose.end[0] - pose.start[0],
      y: pose.end[1] - pose.start[1],
      z: pose.end[2] - pose.start[2],
    };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length <= Number.EPSILON) return;
    node.position.set(
      (pose.start[0] + pose.end[0]) / 2,
      (pose.start[1] + pose.end[1]) / 2,
      (pose.start[2] + pose.end[2]) / 2,
    );
    node.quaternion.setFromUnitVectors(nodeForward, {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    });
    node.scale.z = length;
  });
  scene.queueRender();
}

export interface ModelViewerVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ModelViewerCameraOrbit {
  readonly theta: number;
  readonly phi: number;
  readonly radius: number;
}

export interface ModelViewerElement extends HTMLElement {
  animationName?: string;
  cameraOrbit: string;
  cameraTarget: string;
  currentTime?: number;
  pause?: () => void;
  play?: (options?: {
    readonly pingpong?: boolean;
    readonly repetitions?: number;
  }) => void;
  getCameraOrbit?: () => ModelViewerCameraOrbit;
  getCameraTarget?: () => ModelViewerVector3;
  getFieldOfView?: () => number;
  jumpCameraToGoal?: () => void;
  positionAndNormalFromPoint?: (
    pixelX: number,
    pixelY: number,
  ) => {
    readonly normal: ModelViewerVector3;
    readonly position: ModelViewerVector3;
  } | null;
  updateComplete?: Promise<unknown>;
  setNodePoses?: (poses: readonly ModelViewerNodePose[]) => void;
}

type ModelViewerLoadState = 'loading' | 'ready' | 'error';

type ModelViewerProps = Omit<ComponentProps<'model-viewer'>, 'ref'> & {
  readonly elementRef?: RefObject<ModelViewerElement | null>;
  readonly errorFallback: (retry: () => void) => ReactNode;
  readonly loadingFallback: ReactNode;
};

function canRenderModelViewer(): boolean {
  return (
    typeof WebGLRenderingContext !== 'undefined'
    && typeof customElements !== 'undefined'
  );
}

/** 외부 model-viewer 등록과 load 생명주기를 shared UI 경계 안에서 관리한다. */
export function ModelViewer({
  elementRef,
  errorFallback,
  loadingFallback,
  ...modelViewerProps
}: ModelViewerProps) {
  const internalRef = useRef<ModelViewerElement>(null);
  const [loadState, setLoadState] = useState<ModelViewerLoadState>(
    canRenderModelViewer() ? 'loading' : 'error',
  );
  const [retrySequence, setRetrySequence] = useState(0);
  const assignElement = useCallback((element: HTMLElement | null) => {
    const modelViewer = element as ModelViewerElement | null;
    if (modelViewer !== null) {
      modelViewer.setNodePoses = (poses) => applyNodePoses(modelViewer, poses);
    }
    internalRef.current = modelViewer;
    if (elementRef !== undefined) elementRef.current = modelViewer;
  }, [elementRef]);
  const retry = useCallback(() => {
    if (!canRenderModelViewer()) {
      setLoadState('error');
      return;
    }
    setLoadState('loading');
    setRetrySequence((sequence) => sequence + 1);
  }, []);
  const modelUrl = modelViewerProps.src;

  useEffect(() => {
    if (!canRenderModelViewer()) return undefined;

    const modelViewer = internalRef.current;
    if (modelViewer === null) return undefined;

    let active = true;
    const handleLoad = () => {
      if (active) setLoadState('ready');
    };
    const handleError = () => {
      if (active) setLoadState('error');
    };
    modelViewer.addEventListener('load', handleLoad);
    modelViewer.addEventListener('error', handleError);

    if (customElements.get('model-viewer') === undefined) {
      void import('@google/model-viewer').catch(handleError);
    }

    if (retrySequence > 0 && modelUrl !== undefined) {
      modelViewer.removeAttribute('src');
      modelViewer.setAttribute('src', modelUrl);
    }

    return () => {
      active = false;
      modelViewer.removeEventListener('load', handleLoad);
      modelViewer.removeEventListener('error', handleError);
    };
  }, [modelUrl, retrySequence]);

  return (
    <>
      <model-viewer {...modelViewerProps} ref={assignElement} />
      {loadState === 'loading' ? loadingFallback : null}
      {loadState === 'error' ? errorFallback(retry) : null}
    </>
  );
}
