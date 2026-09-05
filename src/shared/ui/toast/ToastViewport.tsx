import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

const DEFAULT_LAYOUT_DURATION_MS = 180;
const DEFAULT_LAYOUT_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

function readDurationMs(value: string): number {
  const duration = value.trim();
  if (duration.endsWith('ms')) return Number.parseFloat(duration);
  if (duration.endsWith('s')) return Number.parseFloat(duration) * 1_000;
  return DEFAULT_LAYOUT_DURATION_MS;
}

interface ToastViewportProps {
  readonly children: ReactNode;
}

export function ToastViewport({ children }: ToastViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousTopByIdRef = useRef<ReadonlyMap<string, number>>(new Map());

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const tracks = Array.from(
      viewport.querySelectorAll<HTMLElement>(':scope > [data-toast-layout-id]'),
    );
    const currentTopById = new Map<string, number>();
    const styles = getComputedStyle(viewport);
    const duration = readDurationMs(
      styles.getPropertyValue('--design-motion-normal'),
    );
    const easing = styles.getPropertyValue('--design-ease-standard').trim()
      || DEFAULT_LAYOUT_EASING;

    for (const track of tracks) {
      const id = track.dataset.toastLayoutId;
      if (id === undefined) continue;

      const top = track.getBoundingClientRect().top;
      currentTopById.set(id, top);
      const previousTop = previousTopByIdRef.current.get(id);
      const offset = previousTop === undefined ? 0 : previousTop - top;
      if (offset === 0 || typeof track.animate !== 'function') continue;

      for (const animation of track.getAnimations()) animation.cancel();
      track.animate(
        [
          { transform: `translateY(${String(offset)}px)` },
          { transform: 'translateY(0)' },
        ],
        { duration, easing },
      );
    }

    previousTopByIdRef.current = currentTopById;
  }, [children]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-[var(--layout-page-gutter)] top-[var(--layout-toast-offset)] z-[var(--design-z-toast)] mx-auto grid max-w-[var(--layout-toast-max-width)] gap-[var(--layout-toast-gap)]"
      data-toast-viewport
      ref={viewportRef}
    >
      {children}
    </div>,
    document.body,
  );
}
