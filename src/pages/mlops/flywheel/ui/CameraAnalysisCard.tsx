import { CameraAnalysisIssueContext } from '../model/camera-analysis-issues';
import { useContext, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useCameraAnalysis, type CameraRole } from '@/entities/collection-camera';
import { Button } from '@/shared/ui/button';
import { FittedMedia, MediaPanel } from '@/shared/ui/media-panel';
import { StatusIndicator } from '@/shared/ui/status-indicator';

export function CameraAnalysisCard({ label, role, videoRef, playing, rotation = 0, sourceAspectRatio = 16 / 9 }: {
  readonly label: string;
  readonly role: CameraRole;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly playing: boolean;
  readonly rotation?: number;
  readonly sourceAspectRatio?: number;
}) {
  const [enabled, setEnabled] = useState(true);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const aspectRatio = imageAspectRatio ?? sourceAspectRatio;
  const imageRef = useRef<HTMLImageElement>(null);
  const analysis = useCameraAnalysis({ videoRef, imageRef, role, enabled: playing && enabled, rotation });
  const title = `${label} · ${role === 'head' ? '세그멘테이션 + 핸드' : '4D Humans'}`;
  const ready = playing && enabled && analysis.status === 'ready';
  const failed = playing && enabled && analysis.status === 'error';
  const issueId = useId();
  const reportIssue = useContext(CameraAnalysisIssueContext);
  const error = failed ? analysis.error : null;
  useEffect(() => {
    reportIssue?.(issueId, error ? { title, message: error } : null);
    return () => reportIssue?.(issueId, null);
  }, [error, issueId, reportIssue, title]);
  const status = !enabled ? '분석 정지' : !playing ? '영상 대기' : analysis.status === 'error' ? '분석 연결 오류' : ready ? '분석 수신 중' : '분석 대기';
  return <FittedMedia aspectRatio={aspectRatio} className="items-center"><MediaPanel className="collection-camera-panel h-auto" aria-label={title} title={title}
    status={<div className="flex flex-wrap items-center gap-2"><StatusIndicator label={status} tone={failed ? 'warning' : 'neutral'} />
      <Button variant="ghost" aria-label={`${label} 분석 ${enabled ? '정지' : '시작'}`} onClick={() => setEnabled((value) => !value)}>{enabled ? '정지' : '시작'}</Button></div>}>
    <div data-aspect-media-viewport className="relative min-h-0 min-w-0 overflow-hidden" style={{ aspectRatio }}>
      <img ref={imageRef} alt={title} className={`absolute inset-0 h-full w-full object-contain ${ready ? '' : 'invisible'}`}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) setImageAspectRatio(naturalWidth / naturalHeight);
        }} />
    </div>
  </MediaPanel></FittedMedia>;
}
