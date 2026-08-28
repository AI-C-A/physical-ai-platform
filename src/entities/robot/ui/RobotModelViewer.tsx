import { Button } from '@/shared/ui/button';
import { ModelViewer } from '@/shared/ui/model-viewer';
import { Spinner } from '@/shared/ui/spinner';

const ROBOT_MODEL_URL = `${import.meta.env.BASE_URL}assets/go2_walk.glb`;

export function RobotModelViewer() {
  return (
    <figure
      aria-label="로봇 3D 모델"
      className="relative h-52"
      role="group"
    >
      <ModelViewer
        alt="걷는 사족 보행 로봇 3D 모델"
        autoplay
        auto-rotate
        camera-controls
        className="block h-full w-full"
        errorFallback={(retry) => (
          <div className="absolute inset-0 grid place-items-center gap-2 p-4">
            <p className="text-sm text-neutral-700" role="status">
              3D 모델을 표시할 수 없습니다.
            </p>
            <Button onClick={retry} variant="secondary">다시 시도</Button>
          </div>
        )}
        interaction-prompt="none"
        loading="eager"
        loadingFallback={(
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Spinner className="size-6 text-neutral-500" label="3D 모델 불러오는 중" />
          </div>
        )}
        reveal="auto"
        rotation-per-second="12deg"
        shadow-intensity="1"
        src={ROBOT_MODEL_URL}
        touch-action="pan-y"
      >
        <span slot="progress-bar" />
      </ModelViewer>
    </figure>
  );
}
