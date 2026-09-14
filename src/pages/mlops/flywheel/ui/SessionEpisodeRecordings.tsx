import { useEffect, useRef, useState } from 'react';
import type { FlywheelEpisode } from '@/entities/flywheel';
import { Button } from '@/shared/ui/button';
import { formatDuration } from './flywheel-page-utils';

function EpisodeThumbnail({ episode }: { readonly episode: FlywheelEpisode }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [failed, setFailed] = useState(false);
  const video = episode.videos?.find((item) => item.status === 'completed' && item.bytesWritten > 0);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return <span ref={host} className="block relative aspect-video w-full overflow-hidden rounded-[var(--design-radius-control)] bg-layer-base">
    {video && !failed ? visible ? <video
      aria-label={`${episode.name} 썸네일`} src={`${video.url}#t=0.1`} muted playsInline preload="metadata"
      className="pointer-events-none h-full w-full object-contain" tabIndex={-1}
      onError={() => setFailed(true)}
    /> : null : <span className="absolute inset-0 grid place-items-center text-xs text-muted">{failed ? '썸네일을 불러오지 못했습니다' : episode.rawFramesUrl ? '손·머리 위치 데이터' : '영상 없음'}</span>}
    <span className="absolute right-1 bottom-1 rounded bg-layer px-1 text-xs tabular-nums text-foreground">{formatDuration((episode.endedAtMs ?? episode.startedAtMs) - episode.startedAtMs)}</span>
  </span>;
}

export function SessionEpisodeRecordings({ episodes, selectedId, onSelect }: {
  readonly episodes: readonly FlywheelEpisode[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  return <section aria-label="저장 에피소드" className="grid gap-3">
    <h3 className="text-base font-semibold">에피소드 <span className="text-sm text-muted">{episodes.length}개</span></h3>
    {episodes.length === 0 ? <p className="text-sm text-muted">저장한 에피소드가 여기에 표시됩니다.</p> : null}
    <div className="grid grid-cols-2 gap-2">
      {[...episodes].reverse().map((episode) => <Button key={episode.id}
        aria-label={`${episode.name} 재생`} aria-pressed={selectedId === episode.id}
        variant={selectedId === episode.id ? 'primary' : 'secondary'}
        className="h-auto w-full min-w-0 p-2 text-left" onClick={() => onSelect(episode.id)}>
        <span className="grid w-full min-w-0 grid-cols-1 gap-2">
          <EpisodeThumbnail episode={episode} />
          <span className="truncate text-xs">{episode.name}</span>
        </span>
      </Button>)}
    </div>
  </section>;
}
