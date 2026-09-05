import type { MouseEventHandler } from 'react';
import type { NavigateOptions, To } from 'react-router-dom';

export interface RouteMorphConfig {
  readonly contentDurationMs: number;
  readonly durationMs: number;
  readonly easing: string;
  readonly objectPosition: string;
  readonly pressDurationMs: number;
  readonly pressScale: number;
  readonly screenRevealDelayMs: number;
  readonly sourceFadeDurationMs: number;
  readonly targetRevealDelayMs: number;
}

export interface RouteMorphNavigationOptions
  extends Omit<NavigateOptions, 'viewTransition'> {
  readonly radius?: string;
  readonly transition?: Partial<RouteMorphConfig>;
}

export interface RouteMorphElementProps {
  readonly 'data-route-morph-active'?: '';
  readonly 'data-route-morph-id': string;
}

export interface RouteMorphTriggerProps extends RouteMorphElementProps {
  readonly onClick: MouseEventHandler<HTMLElement>;
}

export interface RouteMorphContextValue {
  readonly activeId: string | null;
  readonly close: (
    id: string,
    to: To,
    options?: RouteMorphNavigationOptions,
  ) => void;
  readonly open: (
    id: string,
    source: HTMLElement,
    to: To,
    options?: RouteMorphNavigationOptions,
  ) => void;
}
