import { useRef } from 'react';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

export interface SynchronizedPlayerSource {
  readonly id: string;
  readonly label: string;
  readonly poster?: string;
  readonly src: string;
}

interface SynchronizedPlayerProps {
  readonly sources: readonly SynchronizedPlayerSource[];
  readonly title?: string;
}

export function SynchronizedPlayer({ sources, title = '동기화 멀티뷰' }: SynchronizedPlayerProps) {
  const refs = useRef(new Map<string, HTMLVideoElement>());

  function playAll(): void {
    refs.current.forEach((video) => void video.play());
  }

  function pauseAll(): void {
    refs.current.forEach((video) => video.pause());
  }

  return (
    <section aria-label={title} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong>{title}</strong>
        <div className="flex gap-2">
          <Button onClick={playAll} variant="secondary"><Icon name="play" />전체 재생</Button>
          <Button onClick={pauseAll} variant="secondary"><Icon name="stop" />전체 정지</Button>
        </div>
      </div>
      <div className={sources.length > 2 ? 'grid gap-3 lg:grid-cols-3' : 'grid gap-3 md:grid-cols-2'}>
        {sources.map((source) => (
          <figure className="overflow-hidden rounded-[var(--design-radius-surface)] border border-border bg-black" key={source.id}>
            <video
              aria-label={source.label}
              className="aspect-video w-full object-cover"
              loop
              muted
              playsInline
              poster={source.poster}
              preload="none"
              ref={(element) => {
                if (element === null) refs.current.delete(source.id);
                else refs.current.set(source.id, element);
              }}
              src={source.src}
            />
            <figcaption className="border-t border-border bg-layer-base px-3 py-2 text-xs font-semibold">{source.label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
