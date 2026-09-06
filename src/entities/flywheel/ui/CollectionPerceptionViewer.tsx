import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { FittedMedia, MediaPanel, MediaStreamPlaceholder, getMediaStreamLabel, type MediaStreamState } from '@/shared/ui/media-panel';
import { StatusIndicator } from '@/shared/ui/status-indicator';
import type { CollectionHeadPerception } from '../model/flywheel';

export function CollectionPerceptionViewer({ result, streamState }: { readonly result: CollectionHeadPerception | null; readonly streamState?: MediaStreamState }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = result !== null && (failedUrl === result.depthImageUrl || failedUrl === result.segmentationMaskUrl);
  const unavailable = streamState === 'idle' || streamState === 'offline' || streamState === 'stale' ? streamState : null;
  return (
    <FittedMedia constrained={unavailable !== null || result !== null && !failed}>
      <MediaPanel
        className="h-auto grid-rows-[auto_auto]"
        aria-label="Head RGB Depth와 세그멘테이션"
        data-perception-viewer
        data-stream-state={streamState}
        title="Head Depth + 분할"
        status={unavailable !== null ? <StatusIndicator className="text-xs" label={getMediaStreamLabel(unavailable)} tone={unavailable === 'offline' ? 'negative' : unavailable === 'stale' ? 'warning' : 'neutral'} /> : result === null || failed ? <StatusIndicator className="text-xs" label={failed ? '불러오기 실패' : '결과 대기'} tone={failed ? 'negative' : 'neutral'} /> : null}
      >
        <div className={`relative flex items-center justify-center overflow-hidden ${unavailable !== null || result !== null && !failed ? 'aspect-video' : ''}`} data-aspect-media-viewport data-perception-viewport>
          {unavailable !== null ? <MediaStreamPlaceholder state={unavailable} /> : result === null ? <p className="p-4 text-center text-xs leading-relaxed text-muted">Head RGB의 깊이·세그멘테이션 결과를 기다립니다.</p> : failed ? (
            <div className="grid justify-items-center gap-2 p-3 text-center">
              <p className="text-xs text-muted" role="status">결과를 불러올 수 없습니다. 소스 연결을 확인하세요.</p>
              <Button onClick={() => setFailedUrl(null)} variant="secondary">다시 불러오기</Button>
            </div>
          ) : (
            <div className="absolute inset-0 size-full">
              <img
                alt={result.depthKind === 'relative' ? 'Head RGB 상대 깊이' : 'Head RGB 깊이'}
                className="absolute inset-0 size-full object-contain"
                src={result.depthImageUrl}
                onError={() => setFailedUrl(result.depthImageUrl)}
              />
              <img
                alt="Head RGB 세그멘테이션 마스크"
                className="absolute inset-0 size-full object-contain"
                src={result.segmentationMaskUrl}
                onError={() => setFailedUrl(result.segmentationMaskUrl)}
              />
            </div>
          )}
        </div>
      </MediaPanel>
    </FittedMedia>
  );
}
