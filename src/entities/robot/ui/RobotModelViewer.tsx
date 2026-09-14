import { useEffect, useRef, useSyncExternalStore } from 'react';

import { Button } from '@/shared/ui/button';
import { ModelViewer, type ModelViewerElement } from '@/shared/ui/model-viewer';
import { Spinner } from '@/shared/ui/spinner';

import type { RobotType } from '../model/robot';

const robotModels: Record<RobotType, { file: string; label: string; orbit: string; orientation?: string }> = {
  humanoid: { file: 'openarm-bimanual-five-finger.glb', label: '양팔형 로봇 (오픈암 스타일)', orbit: '-45deg 72deg 115%' },
  // RBQ-10의 Z-up 좌표를 뷰어의 Y-up 좌표로 변환한다.
  quadruped: { file: 'rbq10_walk.glb', label: '사족보행 로봇', orbit: '45deg 65deg 105%', orientation: '0deg -90deg 0deg' },
  mobile: { file: 'four-wheel-rover.glb', label: '사륜 로봇', orbit: '-135deg 65deg 105%' },
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeMotionPreference(listener: () => void) {
  const preference = window.matchMedia?.(REDUCED_MOTION_QUERY);
  preference?.addEventListener('change', listener);
  return () => preference?.removeEventListener('change', listener);
}

function shouldAnimateModel() {
  return !window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
}

interface RobotModelViewerProps {
  readonly nickname?: string | null;
  readonly robotType?: RobotType | undefined;
}

export function RobotModelViewer({ nickname = null, robotType }: RobotModelViewerProps) {
  const model = robotModels[robotType ?? 'quadruped'];
  const modelRef = useRef<ModelViewerElement>(null);
  const animate = useSyncExternalStore(subscribeMotionPreference, shouldAnimateModel, () => false);

  useEffect(() => {
    if (!animate) modelRef.current?.pause?.();
  }, [animate]);

  return (
    <figure
      aria-label="로봇 3D 모델"
      className="flex flex-col"
      role="group"
    >
      <div className="relative h-28 shrink-0 md:h-52">
        <ModelViewer
          key={model.file}
          alt={`${model.label} 3D 모델`}
          autoplay={animate}
          camera-orbit={model.orbit}
          camera-controls
          className="block h-full w-full"
          elementRef={modelRef}
          errorFallback={(retry) => (
            <div className="absolute inset-0 grid place-items-center gap-2 p-4">
              <p className="text-sm text-muted" role="status">
                3D 모델을 표시할 수 없습니다.
              </p>
              <Button onClick={retry} variant="secondary">다시 시도</Button>
            </div>
          )}
          interaction-prompt="none"
          loading="eager"
          loadingFallback={(
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <Spinner className="size-6 text-muted" label="3D 모델 불러오는 중" />
            </div>
          )}
          orientation={model.orientation}
          reveal="auto"
          shadow-intensity="1"
          src={`${import.meta.env.BASE_URL}assets/${model.file}`}
          touch-action="pan-y"
        >
          <span slot="progress-bar" />
        </ModelViewer>
      </div>
      {nickname === null ? null : (
        <figcaption className="mt-2 truncate text-left text-xl font-medium tracking-tight text-foreground md:mt-4 md:text-4xl md:font-light">
          {nickname}
        </figcaption>
      )}
    </figure>
  );
}
