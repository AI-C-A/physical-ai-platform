import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/ui/class-names';
import { Icon } from '@/shared/ui/icon';
import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

const TOAST_AUTO_DISMISS_MS = 4_000;
const TOAST_EXIT_FALLBACK_MS = 250;

interface ToastItemProps {
  readonly id: number;
  readonly message: ReactNode;
  readonly messageId: string;
  readonly onDismiss: (id: number) => void;
  readonly tone: 'success' | 'error';
}

export function ToastItem({
  id,
  message,
  messageId,
  onDismiss,
  tone,
}: ToastItemProps) {
  const [focusPaused, setFocusPaused] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [toastState, setToastState] = useState<'open' | 'exiting'>('open');
  const remainingMsRef = useRef(TOAST_AUTO_DISMISS_MS);
  const toastRef = useRef<HTMLDivElement>(null);
  const paused = focusPaused || pointerPaused;
  const requestDismiss = useCallback(() => {
    setToastState((current) => current === 'open' ? 'exiting' : current);
  }, []);

  useEffect(() => {
    if (tone === 'error' || paused || toastState === 'exiting') return undefined;

    const startedAt = Date.now();
    const timerId = globalThis.setTimeout(requestDismiss, remainingMsRef.current);
    return () => {
      globalThis.clearTimeout(timerId);
      remainingMsRef.current = Math.max(
        0,
        remainingMsRef.current - (Date.now() - startedAt),
      );
    };
  }, [paused, requestDismiss, toastState, tone]);

  useEffect(() => {
    if (toastState !== 'exiting') return undefined;

    const toast = toastRef.current;
    const handleAnimationEnd = (event: Event) => {
      if (event.target === toast) onDismiss(id);
    };
    const timerId = globalThis.setTimeout(
      () => onDismiss(id),
      TOAST_EXIT_FALLBACK_MS,
    );
    toast?.addEventListener('animationend', handleAnimationEnd);
    return () => {
      globalThis.clearTimeout(timerId);
      toast?.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [id, onDismiss, toastState]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setFocusPaused(false);
  };

  return (
    <div
      className={cn(
        'design-motion-toast pointer-events-auto flex min-w-0 items-center gap-[var(--layout-toolbar-gap)] rounded-[var(--design-radius-surface)] px-[var(--layout-toast-padding-inline)] py-[var(--layout-toast-padding-block)] text-foreground',
        getFloatingSurfaceClassName('subtle'),
      )}
      data-toast-state={toastState}
      data-toast-tone={tone}
      onBlur={handleBlur}
      onFocus={() => setFocusPaused(true)}
      onPointerEnter={() => setPointerPaused(true)}
      onPointerLeave={() => setPointerPaused(false)}
      ref={toastRef}
    >
      <span
        className={tone === 'error'
          ? 'shrink-0 text-status-negative-foreground'
          : 'shrink-0 text-status-positive-foreground'}
        data-toast-status-icon
      >
        <Icon name={tone === 'error' ? 'events' : 'check'} size="md" />
      </span>
      <div
        aria-atomic="true"
        className="min-w-0 flex-1 text-sm font-semibold"
        id={messageId}
        role={tone === 'error' ? 'alert' : 'status'}
      >
        {message}
      </div>
      <Button
        aria-describedby={messageId}
        aria-label="알림 닫기"
        className="size-10 shrink-0 p-0 text-muted hover:text-foreground"
        onClick={requestDismiss}
        variant="ghost"
      >
        <Icon name="close" />
      </Button>
    </div>
  );
}
