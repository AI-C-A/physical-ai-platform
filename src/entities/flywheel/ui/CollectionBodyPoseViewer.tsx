import { Button } from '@/shared/ui/button';
import { MediaPanel } from '@/shared/ui/media-panel';
import { ModelViewer } from '@/shared/ui/model-viewer';

export function CollectionBodyPoseViewer() {
  return (
    <MediaPanel
      aria-label="전신 휴머노이드 3D"
      data-body-pose-viewer
      title="Unitree G1"
      status={<span className="text-xs text-muted">기준 모델</span>}
    >
      <div className="relative min-h-0">
        <ModelViewer
          alt="Unitree G1 휴머노이드 3D 기준 모델"
          camera-orbit="20deg 85deg auto"
          className="block h-full min-h-0 w-full"
          environment-image="neutral"
          exposure={1}
          interaction-prompt="none"
          loading="eager"
          src="/assets/unitree-g1.glb"
          loadingFallback={(
            <p className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-muted" role="status">
              G1 모델 불러오는 중
            </p>
          )}
          errorFallback={(retry) => (
            <div className="absolute inset-0 grid content-center justify-items-center gap-3 p-3 text-center">
              <p className="text-xs text-muted" role="status">3D 모델을 표시할 수 없습니다. 연결 상태와 브라우저의 그래픽 가속을 확인하세요.</p>
              <Button onClick={retry} variant="secondary">다시 불러오기</Button>
            </div>
          )}
        />
      </div>
    </MediaPanel>
  );
}
