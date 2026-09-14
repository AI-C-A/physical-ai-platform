import type { DetailedHTMLProps, HTMLAttributes } from 'react';

interface ModelViewerAttributes
  extends DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> {
  readonly alt?: string;
  readonly 'animation-name'?: string;
  readonly autoplay?: boolean;
  readonly 'auto-rotate'?: boolean;
  readonly 'camera-controls'?: boolean;
  readonly 'camera-orbit'?: string;
  readonly 'disable-tap'?: boolean;
  readonly 'environment-image'?: string;
  readonly exposure?: number;
  readonly 'field-of-view'?: string;
  readonly 'interaction-prompt'?: 'auto' | 'none';
  readonly 'interpolation-decay'?: number;
  readonly loading?: 'auto' | 'eager' | 'lazy';
  readonly 'max-camera-orbit'?: string;
  readonly 'min-camera-orbit'?: string;
  readonly orientation?: string | undefined;
  readonly reveal?: 'auto' | 'interaction' | 'manual';
  readonly 'rotation-per-second'?: string;
  readonly 'shadow-intensity'?: string;
  readonly 'shadow-softness'?: string;
  readonly src?: string;
  readonly 'tone-mapping'?: 'neutral' | 'aces' | 'agx' | 'reinhard' | 'cineon' | 'linear' | 'none';
  readonly 'touch-action'?: 'none' | 'pan-x' | 'pan-y';
  readonly 'time-scale'?: number;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerAttributes;
    }
  }
}

export {};
