import * as SelectPrimitive from '@radix-ui/react-select';

import { Icon } from '@/shared/ui/icon';

export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

interface SelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly onValueChange: (value: string) => void;
}

export function Select({
  label,
  value,
  options,
  disabled = false,
  placeholder,
  onValueChange,
}: SelectProps) {
  return (
    <div className="grid min-w-40 gap-1.5">
      <span className="text-sm font-medium text-neutral-800">
        {label}
      </span>
      <SelectPrimitive.Root
        disabled={disabled}
        onValueChange={onValueChange}
        value={value}
      >
        <SelectPrimitive.Trigger
          aria-label={label}
          className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-neutral-300 bg-white px-3 py-2 text-left text-sm text-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon aria-hidden="true">
            <Icon name="chevron-down" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            aria-label={`${label} 선택`}
            className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-neutral-300 bg-white p-1 shadow-lg"
            position="popper"
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  className="relative flex min-h-9 cursor-default select-none items-center rounded-sm py-2 pr-8 pl-3 text-sm text-neutral-900 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:opacity-50"
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
