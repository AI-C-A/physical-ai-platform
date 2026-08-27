import type { DetailedHTMLProps, HTMLAttributes } from 'react';

interface ModelViewerAttributes
  extends DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> {
  readonly alt?: string;
  readonly autoplay?: boolean;
  readonly 'auto-rotate'?: boolean;
  readonly 'camera-controls'?: boolean;
  readonly 'interaction-prompt'?: 'auto' | 'none';
  readonly loading?: 'auto' | 'eager' | 'lazy';
  readonly reveal?: 'auto' | 'interaction' | 'manual';
  readonly 'rotation-per-second'?: string;
  readonly 'shadow-intensity'?: string;
  readonly src?: string;
  readonly 'touch-action'?: 'none' | 'pan-x' | 'pan-y';
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerAttributes;
    }
  }
}

export {};
