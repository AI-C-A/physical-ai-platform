import type { ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export interface TabItem {
  readonly content: ReactNode;
  readonly label: string;
  readonly value: string;
}

interface TabsProps {
  readonly defaultValue?: string;
  readonly items: readonly TabItem[];
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}

export function Tabs({ defaultValue, items, onValueChange, value }: TabsProps) {
  return (
    <TabsPrimitive.Root
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      {...(value === undefined ? {} : { value })}
    >
      <TabsPrimitive.List className="flex gap-1 border-b border-neutral-300" aria-label="보기 전환">
        {items.map((item) => (
          <TabsPrimitive.Trigger
            className="border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-neutral-600 data-[state=active]:border-neutral-900 data-[state=active]:text-neutral-950"
            key={item.value}
            value={item.value}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content className="pt-4" key={item.value} value={item.value}>
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
