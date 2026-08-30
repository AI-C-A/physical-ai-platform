import * as SelectPrimitive from '@radix-ui/react-select';

import { cn } from '@/shared/ui/class-names';
import { Icon, type IconName } from '@/shared/ui/icon';

export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

interface SelectProps {
  readonly className?: string;
  readonly contentClassName?: string;
  readonly itemClassName?: string;
  readonly leadingIcon?: IconName;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly onValueChange: (value: string) => void;
  readonly showLabel?: boolean;
  readonly triggerClassName?: string;
}

export function Select({
  className,
  contentClassName,
  itemClassName,
  leadingIcon,
  label,
  value,
  options,
  disabled = false,
  placeholder,
  onValueChange,
  showLabel = true,
  triggerClassName,
}: SelectProps) {
  return (
    <div className={cn('grid min-w-40 gap-1.5', className)}>
      {showLabel ? (
        <span className="text-sm font-medium text-foreground">
          {label}
        </span>
      ) : null}
      <SelectPrimitive.Root
        disabled={disabled}
        onValueChange={onValueChange}
        value={value}
      >
        <SelectPrimitive.Trigger
          aria-label={label}
          className={cn(
            'flex min-h-[var(--layout-control-height)] w-full items-center justify-between gap-3 rounded-[var(--design-radius-control)] border border-border bg-layer-base px-3 py-2 text-left text-sm text-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted',
            triggerClassName,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {leadingIcon === undefined ? null : (
              <Icon name={leadingIcon} />
            )}
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <SelectPrimitive.Icon aria-hidden="true">
            <Icon name="chevron-down" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            aria-label={`${label} 선택`}
            className={cn(
              'z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--design-radius-control)] border-0 bg-layer-floating p-1 text-foreground shadow-lg',
              contentClassName,
            )}
            position="popper"
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  className={cn(
                    'relative flex min-h-9 cursor-default select-none items-center rounded-sm py-2 pr-8 pl-3 text-sm text-foreground outline-none data-[highlighted]:bg-action-secondary-hover data-[disabled]:opacity-50',
                    itemClassName,
                  )}
                  key={option.value}
                  value={option.value}
                >
                  <SelectPrimitive.ItemText>
                    {option.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator
                    aria-hidden="true"
                    className="absolute right-2"
                  >
                    <Icon name="check" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
