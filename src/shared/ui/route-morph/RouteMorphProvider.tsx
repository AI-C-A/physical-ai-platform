import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate, type To } from 'react-router-dom';

import { RouteMorphContext } from './route-morph-context';
import type {
  RouteMorphConfig,
  RouteMorphContextValue,
  RouteMorphNavigationOptions,
} from './route-morph-types';
import './route-morph.css';

interface RouteMorphProviderProps extends PropsWithChildren {
  readonly defaults?: Partial<RouteMorphConfig>;
}

const defaultConfig: RouteMorphConfig = {
  contentDurationMs: 180,
  durationMs: 550,
  easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
  objectPosition: 'center',
  pressDurationMs: 64,
  pressScale: 1.045,
  screenRevealDelayMs: 40,
  sourceFadeDurationMs: 120,
  targetRevealDelayMs: 120,
};

const rootProperties = [
  '--route-morph-content-duration',
  '--route-morph-duration',
  '--route-morph-ease',
  '--route-morph-object-position',
  '--route-morph-radius',
  '--route-morph-screen-delay',
  '--route-morph-source-duration',
  '--route-morph-target-delay',
] as const;

function setRootProperty(name: string, value: string): void {
  document.documentElement.style.setProperty(name, value);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ?? false;
}

/**
 * 한 번에 하나의 source/target 쌍만 브라우저 snapshot 전환에 참여시킨다.
 * React Router Data Router 안에서 렌더링해야 한다.
 */
export function RouteMorphProvider({
  children,
  defaults,
}: RouteMorphProviderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const config = useMemo(
    () => ({ ...defaultConfig, ...defaults }),
    [defaults],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const unlockTimerRef = useRef<number | null>(null);
  const transitionRunningRef = useRef(false);
  const transitionDurationRef = useRef(0);
  const transitionGenerationRef = useRef(0);
  const radiusByIdRef = useRef(new Map<string, string>());

  useEffect(() => () => {
    transitionGenerationRef.current += 1;
    transitionRunningRef.current = false;
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
    }
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
    }

    delete document.documentElement.dataset.routeMorphDirection;
    for (const property of rootProperties) {
      document.documentElement.style.removeProperty(property);
    }
  }, []);

  const finishTransition = useCallback((generation: number) => {
    if (transitionGenerationRef.current !== generation) return;
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    transitionRunningRef.current = false;
    delete document.documentElement.dataset.routeMorphDirection;
    setActiveId(null);
  }, []);

  const unlockAfter = useCallback((durationMs: number, generation: number) => {
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
    }

    unlockTimerRef.current = window.setTimeout(() => {
      finishTransition(generation);
    }, durationMs);
  }, [finishTransition]);

  useEffect(() => {
    if (!transitionRunningRef.current) return;
    const generation = transitionGenerationRef.current;
    const activeViewTransition = document.activeViewTransition;

    if (
      activeViewTransition === null
      || activeViewTransition === undefined
    ) {
      const fallbackDelayMs = transitionDurationRef.current === 0
        ? 0
        : transitionDurationRef.current + 250;
      unlockAfter(fallbackDelayMs, generation);
      return;
    }

    // 브라우저가 snapshot pseudo-tree를 제거한 뒤에만 전용 selector를 해제한다.
    unlockAfter(transitionDurationRef.current + 1_000, generation);
    void activeViewTransition.finished.then(
      () => finishTransition(generation),
      () => finishTransition(generation),
    );
  }, [location.key, finishTransition, unlockAfter]);

  const prepare = useCallback((
    id: string,
    direction: 'open' | 'close',
    transition: Partial<RouteMorphConfig> | undefined,
    source?: HTMLElement,
    radiusOverride?: string,
  ): RouteMorphConfig => {
    const resolved = { ...config, ...transition };
    const measuredRadius = radiusOverride ?? (source === undefined
      ? radiusByIdRef.current.get(id) ?? '0px'
      : getComputedStyle(source).borderRadius);

    if (source !== undefined) radiusByIdRef.current.set(id, measuredRadius);

    document.documentElement.dataset.routeMorphDirection = direction;
    setRootProperty('--route-morph-radius', measuredRadius);
    setRootProperty('--route-morph-duration', `${String(resolved.durationMs)}ms`);
    setRootProperty('--route-morph-ease', resolved.easing);
    setRootProperty('--route-morph-object-position', resolved.objectPosition);
    setRootProperty(
      '--route-morph-content-duration',
      `${String(resolved.contentDurationMs)}ms`,
    );
    setRootProperty(
      '--route-morph-target-delay',
      `${String(resolved.targetRevealDelayMs)}ms`,
    );
    setRootProperty(
      '--route-morph-screen-delay',
      `${String(resolved.screenRevealDelayMs)}ms`,
    );
    setRootProperty(
      '--route-morph-source-duration',
      `${String(resolved.sourceFadeDurationMs)}ms`,
    );

    return resolved;
  }, [config]);

  const open = useCallback((
    id: string,
    source: HTMLElement,
    to: To,
    options: RouteMorphNavigationOptions = {},
  ): void => {
    if (transitionRunningRef.current) return;
    transitionRunningRef.current = true;
    transitionGenerationRef.current += 1;
    const generation = transitionGenerationRef.current;

    const { radius, transition, ...navigateOptions } = options;
    const resolved = prepare(id, 'open', transition, source, radius);
    const reduceMotion = prefersReducedMotion();
    const canAnimatePress = typeof source.animate === 'function';
    const pressDurationMs = reduceMotion || !canAnimatePress
      ? 0
      : resolved.pressDurationMs;
    const viewTransitionDurationMs = 'startViewTransition' in document
      ? (reduceMotion ? 1 : resolved.durationMs)
      : 0;
    transitionDurationRef.current = viewTransitionDurationMs;

    flushSync(() => setActiveId(id));
    if (pressDurationMs > 0) {
      source.animate(
        { scale: [1, resolved.pressScale] },
        {
          duration: pressDurationMs,
          easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
          fill: 'forwards',
        },
      );
    }

    pressTimerRef.current = window.setTimeout(() => {
      void navigate(to, { ...navigateOptions, viewTransition: true });
      pressTimerRef.current = null;
    }, pressDurationMs);
    // 실제 라우트 변경 effect가 전환 시간으로 다시 예약한다. 탐색 실패만 이 fallback이 해제한다.
    unlockAfter(10_000, generation);
  }, [navigate, prepare, unlockAfter]);

  const close = useCallback((
    id: string,
    to: To,
    options: RouteMorphNavigationOptions = {},
  ): void => {
    if (transitionRunningRef.current) return;
    transitionRunningRef.current = true;
    transitionGenerationRef.current += 1;
    const generation = transitionGenerationRef.current;

    const { radius, transition, ...navigateOptions } = options;
    const resolved = prepare(id, 'close', transition, undefined, radius);
    const reduceMotion = prefersReducedMotion();
    const viewTransitionDurationMs = 'startViewTransition' in document
      ? (reduceMotion ? 1 : resolved.durationMs)
      : 0;
    transitionDurationRef.current = viewTransitionDurationMs;

    flushSync(() => setActiveId(id));
    void navigate(to, { ...navigateOptions, viewTransition: true });
    unlockAfter(10_000, generation);
  }, [navigate, prepare, unlockAfter]);

  const value = useMemo<RouteMorphContextValue>(() => ({
    activeId,
    close,
    open,
  }), [activeId, close, open]);

  return (
    <RouteMorphContext.Provider value={value}>
      {children}
    </RouteMorphContext.Provider>
  );
}
