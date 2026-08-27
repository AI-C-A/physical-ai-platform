import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

import { Icon } from '@/shared/ui/icon';

interface CheckboxProps {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onCheckedChange: (checked: boolean) => void;
}

export function Checkbox({
  checked,
  disabled = false,
  label,
  onCheckedChange,
}: CheckboxProps) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-neutral-800 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
      <CheckboxPrimitive.Root
        checked={checked}
        className="grid size-5 place-items-center rounded border border-neutral-400 bg-white data-[state=checked]:border-neutral-900 data-[state=checked]:bg-neutral-900 data-[state=checked]:text-white"
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      >
        <CheckboxPrimitive.Indicator aria-hidden="true">
          <Icon name="check" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label}
    </label>
  );
}
