import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';

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
  cameraOrbit: string;
  cameraTarget: string;
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
