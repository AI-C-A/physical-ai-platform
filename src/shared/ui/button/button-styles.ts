import { cn } from '@/shared/ui/class-names';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'recording-stop';

export function getButtonClassName(
  variant: ButtonVariant = 'primary',
  className?: string,
) {
  return cn(
    'relative inline-flex min-h-[var(--layout-control-height)] transform-gpu items-center justify-center gap-2 whitespace-nowrap rounded-[var(--design-radius-control)] border px-3 py-2 text-sm font-semibold transition-[background-color,border-color,color,opacity,transform] active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    variant === 'primary'
      && 'border-transparent bg-action-primary text-action-on-fill hover:bg-action-primary-hover active:bg-action-primary-active',
    variant === 'secondary'
      && 'border-border bg-action-secondary text-foreground hover:bg-action-secondary-hover active:bg-action-secondary-active',
    variant === 'ghost'
      && 'border-transparent bg-transparent text-foreground hover:bg-action-secondary-hover active:bg-action-secondary-active',
    variant === 'danger'
      && 'border-transparent bg-action-danger text-action-on-fill hover:bg-action-danger-hover active:bg-action-danger-active',
    variant === 'recording-stop'
      && 'border-border bg-action-secondary text-negative hover:bg-status-negative-background hover:text-negative active:bg-status-negative-background active:text-negative',
    className,
  );
}
