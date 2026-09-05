import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/shared/ui/class-names';

/** 카드 내부가 아니라 카드 바깥에 여유 공간을 둔다. 헤더가 줄바꿈해도 영상은 16:9다. */
export function FittedMedia({ children, className, constrained = true }: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly constrained?: boolean;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const card = cardRef.current;
    if (!constrained || slot === null || card === null) return;
    let frame = 0;
    function fit(): void {
      if (slot === null || card === null || slot.clientHeight === 0) return;
      const viewport = card.querySelector<HTMLElement>('[data-aspect-media-viewport]');
      if (viewport === null) return;
      // 매번 가용 너비에서 시작해야 화면이 넓어질 때도 카드가 다시 커진다.
      let width = slot.clientWidth;
      for (let pass = 0; pass < 8; pass += 1) {
        card.style.width = `${String(width)}px`;
        const chrome = card.getBoundingClientRect().height - viewport.getBoundingClientRect().height;
        const next = Math.min(width, Math.max(0, (slot.clientHeight - chrome) * 16 / 9));
        if (Math.abs(next - width) < 0.5) break;
        width = next;
      }
      card.style.width = `${String(width)}px`;
    }
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer?.observe(slot);
    observer?.observe(card);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      card.style.width = '';
    };
  }, [constrained]);

  return (
    <div className={cn('flex min-h-0 min-w-0 items-start justify-center', constrained ? 'h-full' : undefined, className)} data-fitted-media ref={slotRef}>
      <div className="w-full min-w-0" ref={cardRef}>{children}</div>
    </div>
  );
}
