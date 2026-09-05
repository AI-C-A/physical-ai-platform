import { Button } from '@/shared/ui/button';
import { ModelViewer } from '@/shared/ui/model-viewer';
import { Spinner } from '@/shared/ui/spinner';

const ROBOT_MODEL_URL = `${import.meta.env.BASE_URL}assets/go2_walk-monitoring.glb`;
const DEFAULT_CAMERA_ORBIT = '-135deg 65deg 105%';

interface RobotModelViewerProps {
  readonly nickname?: string | null;
}

export function RobotModelViewer({ nickname = null }: RobotModelViewerProps) {
  return (
    <figure
      aria-label="로봇 3D 모델"
      className="flex flex-col"
      role="group"
    >
      <div className="relative h-28 shrink-0 md:h-52">
        <ModelViewer
          alt="걷는 사족 보행 로봇 3D 모델"
          autoplay
          camera-orbit={DEFAULT_CAMERA_ORBIT}
          camera-controls
          className="block h-full w-full"
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
          reveal="auto"
          shadow-intensity="1"
          src={ROBOT_MODEL_URL}
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
