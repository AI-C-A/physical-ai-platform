import { useRef, useState, type RefObject } from 'react';
import { useCameraAnalysis, type CameraRole } from '@/entities/collection-camera';
import { Button } from '@/shared/ui/button';
import { MediaPanel } from '@/shared/ui/media-panel';
import { StatusIndicator } from '@/shared/ui/status-indicator';

export function CameraAnalysisCard({ label, role, videoRef, playing, rotation = 0 }: {
  readonly label: string;
  readonly role: CameraRole;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly playing: boolean;
  readonly rotation?: number;
}) {
  const [enabled, setEnabled] = useState(true);
  const imageRef = useRef<HTMLImageElement>(null);
  const analysis = useCameraAnalysis({ videoRef, imageRef, role, enabled: playing && enabled, rotation });
  const title = `${label} · ${role === 'head' ? '세그멘테이션 + 핸드' : '4D Humans'}`;
  const ready = playing && enabled && analysis.status === 'ready';
  const status = !enabled ? '분석 정지' : !playing ? '영상 대기' : analysis.status === 'error' ? '분석 연결 오류' : ready ? '분석 수신 중' : '분석 대기';
  return <MediaPanel aria-label={title} title={title}
    status={<div className="flex flex-wrap items-center gap-2"><StatusIndicator label={status} tone={analysis.status === 'error' ? 'warning' : 'neutral'} />
      <Button variant="ghost" aria-label={`${label} 분석 ${enabled ? '정지' : '시작'}`} onClick={() => setEnabled((value) => !value)}>{enabled ? '정지' : '시작'}</Button></div>}
    footer={ready ? `${role === 'head' ? '손' : '사람'} ${String(analysis.count)} · 분석 왕복 ${String(analysis.latencyMs)} ms` : role === 'head' ? '같은 프레임의 세그멘테이션과 손 관절' : '전신 동작 · 3D 메시'}>
    <div className="relative h-full min-h-0 overflow-hidden">
      <img ref={imageRef} alt={title} className={`h-full w-full object-contain ${ready ? '' : 'invisible'}`} />
      {!ready ? <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted" role="status">
        {!enabled ? '분석이 정지되었습니다.' : !playing ? '카메라 영상이 연결되면 분석을 시작합니다.' : analysis.status === 'error' ? '분석 서버에 연결하지 못했습니다. 자동으로 다시 연결합니다.' : '새 분석 프레임을 기다리고 있습니다.'}
      </div> : null}
    </div>
  </MediaPanel>;
}
