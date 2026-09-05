import { useState, type ReactNode, type RefCallback } from 'react';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { SynchronizedPlayerSource } from './SynchronizedPlayer';

interface SynchronizedMediaProps {
  readonly children?: ReactNode;
  readonly monitoring: boolean;
  readonly source: SynchronizedPlayerSource;
  readonly videoRef: RefCallback<HTMLVideoElement>;
}

export function SynchronizedMedia({ children, monitoring, source, videoRef }: SynchronizedMediaProps) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const label = monitoring || source.meta === undefined
    ? source.label
    : `${source.label} · ${source.meta}`;

  return (
    <>
      {source.imageSrc === undefined ? (
        <video
          aria-label={label}
          autoPlay={monitoring && source.status === 'live'}
          className={`absolute inset-0 h-full w-full object-contain ${failed ? 'invisible' : ''} ${source.renderMode === 'depth' ? 'grayscale invert contrast-125' : ''}`}
          data-render-mode={source.renderMode ?? 'rgb'}
          key={attempt}
          loop
          muted
          onError={() => setFailed(true)}
          playsInline
          poster={source.poster}
          preload={attempt === 0 ? 'none' : 'auto'}
          ref={videoRef}
          src={source.src}
        />
      ) : (
        <img
          alt=""
          aria-label={label}
          className={`absolute inset-0 h-full w-full object-contain ${failed ? 'invisible' : ''}`}
          data-render-mode={source.renderMode ?? 'rgb'}
          key={attempt}
          onError={() => setFailed(true)}
          src={source.imageSrc}
        />
      )}
      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-media-background px-4 text-center text-media-foreground">
          <div className="grid justify-items-center gap-3">
            <Icon name="wifi-off" size="md" />
            <p className="text-sm font-semibold" role="status">{source.label} 영상을 불러오지 못했습니다.</p>
            <Button
              aria-label={`${source.label} 다시 불러오기`}
              onClick={() => {
                setFailed(false);
                setAttempt((current) => current + 1);
              }}
              variant="secondary"
            >
              다시 불러오기
            </Button>
          </div>
        </div>
      ) : children}
    </>
  );
}
