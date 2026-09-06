import { cn } from '@/shared/ui/class-names';

export type FieldSize = 'default' | 'large';
export type FieldSurface = 'default' | 'overlay';

export function getFieldClassName(size: FieldSize, surface: FieldSurface) {
  return cn(
    'ui-field w-full rounded-[var(--design-radius-field)] px-3 py-2 text-base font-normal sm:text-sm',
    size === 'large' ? 'min-h-[var(--layout-control-height-large)]' : 'min-h-[var(--layout-control-height)]',
    surface === 'overlay' && 'shadow-xl backdrop-blur-[var(--design-backdrop-blur-floating)]',
  );
}
