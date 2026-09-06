import { cn } from '@/shared/ui/class-names';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'recording-stop';

export function getButtonClassName(
  variant: ButtonVariant = 'primary',
  className?: string,
) {
  return cn(
    'ui-pressable relative inline-flex min-h-[var(--layout-control-height)] items-center justify-center gap-2 whitespace-nowrap rounded-[var(--design-radius-control)] border-0 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border forced-colors:border-[ButtonText]',
    variant === 'primary'
      && 'bg-action-primary text-action-on-fill hover:bg-action-primary-hover active:bg-action-primary-active',
    variant === 'secondary'
      && 'bg-action-secondary text-action-secondary-foreground hover:bg-action-secondary-hover active:bg-action-secondary-active active:text-action-secondary-active-foreground',
    variant === 'ghost'
      && 'bg-transparent text-foreground hover:bg-action-ghost-hover active:bg-action-ghost-active data-[state=open]:bg-action-ghost-hover',
    variant === 'danger'
      && 'bg-action-danger text-action-on-fill hover:bg-action-danger-hover active:bg-action-danger-active',
    variant === 'recording-stop'
      && 'bg-action-secondary text-negative hover:bg-status-negative-background hover:text-negative active:bg-status-negative-background active:text-negative',
    className,
  );
}
