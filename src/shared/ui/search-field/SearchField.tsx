import { useImperativeHandle, useRef } from 'react';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input, type InputProps } from '@/shared/ui/input';

interface SearchFieldProps extends Omit<InputProps, 'value' | 'defaultValue' | 'onChange' | 'type' | 'role' | 'leadingIcon' | 'endAdornment'> {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly clearable?: boolean;
}

export function SearchField({ value, onValueChange, clearable = true, inputRef, disabled, readOnly, label, ...props }: SearchFieldProps) {
  const fieldRef = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(inputRef, () => fieldRef.current!, []);
  return (
    <Input
      {...props}
      disabled={disabled}
      readOnly={readOnly}
      inputRef={fieldRef}
      label={label}
      leadingIcon="search"
      type="text"
      role="searchbox"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      endAdornment={clearable && value.length > 0 && !disabled && !readOnly ? (
        <Button
          aria-label={`${label}${label.endsWith('검색') ? '어' : ''} 모두 지우기`}
          className="size-8 min-h-8 rounded-[var(--design-radius-round)] p-0"
          onClick={() => {
            onValueChange('');
            fieldRef.current?.focus();
          }}
          variant="ghost"
        >
          <Icon name="close" />
        </Button>
      ) : undefined}
    />
  );
}
