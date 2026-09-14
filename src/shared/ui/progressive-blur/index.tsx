import BlurEffect from 'react-progressive-blur';

export function ProgressiveBlur({ position, intensity, className }: {
  readonly position: 'left' | 'top';
  readonly intensity: number;
  readonly className?: string;
}) {
  return <BlurEffect position={position} intensity={intensity} {...(className ? { className } : {})} />;
}
