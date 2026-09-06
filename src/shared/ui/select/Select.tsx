import * as SelectPrimitive from '@radix-ui/react-select';

import { cn } from '@/shared/ui/class-names';
import { Icon, type IconName } from '@/shared/ui/icon';
import { getFieldClassName, type FieldSize, type FieldSurface } from '@/shared/ui/input';
import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

interface SelectProps {
  readonly className?: string;
  readonly controlSize?: FieldSize;
  readonly surface?: FieldSurface;
  readonly leadingIcon?: IconName;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly onValueChange: (value: string) => void;
  readonly showLabel?: boolean;
}

export function Select({
  className,
  controlSize = 'default',
  surface = 'default',
  leadingIcon,
  label,
  value,
  options,
  disabled = false,
  placeholder,
  onValueChange,
  showLabel = true,
}: SelectProps) {
  return (
    <div className={cn('ui-field-group grid min-w-40 gap-1.5', className)}>
      {showLabel ? (
        <span className="ui-field-label text-sm font-medium">
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
            getFieldClassName(controlSize, surface),
            'ui-pressable ui-pressable--subtle flex items-center justify-between gap-3 text-left',
          )}
          data-surface={surface}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {leadingIcon === undefined ? null : (
              <Icon name={leadingIcon} />
            )}
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <SelectPrimitive.Icon aria-hidden="true" className="design-motion-disclosure">
            <Icon name="chevron-down" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            aria-label={`${label} 선택`}
            className={cn(
              'design-motion-select ui-menu-surface z-[var(--design-z-popover)] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-hidden',
              getFloatingSurfaceClassName(),
            )}
            collisionPadding={12}
            position="popper"
            sideOffset={6}
          >
            <SelectPrimitive.Viewport className="max-h-[var(--radix-select-content-available-height)] overscroll-contain">
              {options.map((option) => (
                <SelectPrimitive.Item
                  className={cn(
                    'ui-pressable ui-pressable--subtle ui-menu-item relative flex select-none items-center py-2 pr-9 pl-3 text-sm',
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
