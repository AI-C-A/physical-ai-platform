import { useEffect, useRef, useState } from 'react';

import { Spinner } from '@/shared/ui/spinner';

const ROBOT_MODEL_URL = `${import.meta.env.BASE_URL}assets/go2_walk.glb`;

type ModelLoadState = 'loading' | 'ready' | 'error';

function canRenderModel() {
  return (
    typeof WebGLRenderingContext !== 'undefined'
    && typeof customElements !== 'undefined'
  );
}

export function RobotModelViewer() {
  const modelViewerRef = useRef<HTMLElement>(null);
  const [loadState, setLoadState] = useState<ModelLoadState>(
    canRenderModel() ? 'loading' : 'error',
  );

  useEffect(() => {
    if (!canRenderModel()) return undefined;

    const modelViewer = modelViewerRef.current;
    if (modelViewer === null) return undefined;

    const handleLoad = () => setLoadState('ready');
    const handleError = () => setLoadState('error');
    modelViewer.addEventListener('load', handleLoad);
    modelViewer.addEventListener('error', handleError);

    if (customElements.get('model-viewer') === undefined) {
      void import('@google/model-viewer').catch(handleError);
    }

    return () => {
      modelViewer.removeEventListener('load', handleLoad);
      modelViewer.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <figure
      aria-label="로봇 3D 모델"
      className="relative h-52"
      role="group"
    >
      <model-viewer
        alt="걷는 사족 보행 로봇 3D 모델"
        autoplay
        auto-rotate
        camera-controls
        className="block h-full w-full"
        interaction-prompt="none"
        loading="eager"
        ref={modelViewerRef}
        reveal="auto"
        rotation-per-second="12deg"
        shadow-intensity="1"
        src={ROBOT_MODEL_URL}
        touch-action="pan-y"
      >
        <span slot="progress-bar" />
      </model-viewer>
      {loadState === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Spinner className="size-6 text-neutral-500" label="3D 모델 불러오는 중" />
        </div>
      ) : null}
      {loadState === 'error' ? (
        <span className="sr-only" role="status">3D 모델을 표시할 수 없습니다.</span>
      ) : null}
    </figure>
  );
}
