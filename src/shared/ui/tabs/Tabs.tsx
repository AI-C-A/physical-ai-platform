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
      <TabsPrimitive.List className="flex gap-1 border-b border-border" aria-label="보기 전환">
        {items.map((item) => (
          <TabsPrimitive.Trigger
            className="border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted data-[state=active]:border-foreground data-[state=active]:text-foreground"
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
