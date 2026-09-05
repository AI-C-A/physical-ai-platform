import { cn } from '@/shared/ui/class-names';

export type FloatingSurfaceElevation = 'default' | 'prominent' | 'subtle';

const elevationClassNames: Record<FloatingSurfaceElevation, string> = {
  default: 'shadow-lg',
  prominent: 'shadow-xl',
  subtle: 'shadow-md',
};

export function getFloatingSurfaceClassName(
  elevation: FloatingSurfaceElevation = 'default',
): string {
  return cn(
    'bg-layer-floating backdrop-blur-[var(--design-backdrop-blur-floating)]',
    elevationClassNames[elevation],
  );
}
