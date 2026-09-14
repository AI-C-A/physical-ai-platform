import type { RouteMorphConfig } from './route-morph-types';

export const defaultRouteMorphConfig: RouteMorphConfig = {
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
