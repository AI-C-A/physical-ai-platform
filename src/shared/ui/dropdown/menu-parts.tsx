import { useId, type ComponentProps, type ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-dropdown-menu';

import { cn } from '@/shared/ui/class-names';
import { Icon } from '@/shared/ui/icon';
import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

import './menu.css';

export { Root, Trigger } from '@radix-ui/react-dropdown-menu';

type ContentProps = Omit<ComponentProps<typeof Primitive.Content>, 'className' | 'style' | 'asChild'> & {
  readonly width?: 'content' | 'trigger' | 'wide';
};

export function Content({
  children,
  width = 'content',
  align = 'end',
  sideOffset = 6,
  collisionPadding = 12,
  ...props
}: ContentProps) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'ui-menu-surface design-motion-menu z-[var(--design-z-popover)] max-h-[var(--radix-dropdown-menu-content-available-height)] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain',
          width === 'trigger' ? 'w-[var(--radix-dropdown-menu-trigger-width)]' : width === 'wide' ? 'w-80' : 'min-w-48',
          getFloatingSurfaceClassName(),
        )}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

type ItemProps = Omit<ComponentProps<typeof Primitive.Item>, 'children' | 'className' | 'style' | 'asChild'> & {
  readonly label: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly selected?: boolean;
};

export function Item({ 'aria-describedby': describedBy, label, description, icon, selected = false, ...props }: ItemProps) {
  const descriptionId = useId();
  return (
    <Primitive.Item
      aria-current={selected ? 'page' : undefined}
      aria-describedby={[describedBy, description ? descriptionId : undefined].filter(Boolean).join(' ') || undefined}
      aria-label={label}
      textValue={label}
      {...props}
      className={cn('ui-pressable ui-pressable--subtle ui-menu-item flex items-center gap-3 px-3 text-sm', description ? 'py-3' : 'py-2')}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={description ? 'break-words text-base font-semibold' : 'truncate'}>{label}</span>
        {description ? <span className="text-sm font-normal leading-5 text-menu-muted" id={descriptionId}>{description}</span> : null}
      </span>
      {selected ? <span className="shrink-0"><Icon name="check" /></span> : null}
    </Primitive.Item>
  );
}

export function Label({ children }: { readonly children: ReactNode }) {
  return <Primitive.Label className="px-3 py-2 text-xs font-normal text-menu-muted">{children}</Primitive.Label>;
}
