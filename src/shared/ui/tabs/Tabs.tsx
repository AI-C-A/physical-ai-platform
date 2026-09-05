import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

export interface TabItem {
  readonly content: ReactNode;
  readonly label: string;
  readonly value: string;
}

interface TabsProps {
  readonly density?: 'normal' | 'compact';
  readonly defaultValue?: string;
  readonly items: readonly TabItem[];
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}

interface IndicatorLayout {
  readonly animate: boolean;
  readonly left: number;
  readonly visible: boolean;
  readonly width: number;
}

const HIDDEN_INDICATOR: IndicatorLayout = {
  animate: false,
  left: 0,
  visible: false,
  width: 0,
};

export function Tabs({ defaultValue, density = 'normal', items, onValueChange, value }: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [indicatorLayout, setIndicatorLayout] = useState(HIDDEN_INDICATOR);
  const hasMeasuredRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeValue = value ?? uncontrolledValue;

  const measureIndicator = useCallback(() => {
    const trigger = activeValue === undefined
      ? undefined
      : triggerRefs.current.get(activeValue);

    if (trigger === undefined) {
      setIndicatorLayout((current) => current.visible ? HIDDEN_INDICATOR : current);
      return;
    }

    const nextLeft = trigger.offsetLeft;
    const nextWidth = trigger.offsetWidth;
    setIndicatorLayout((current) => {
      if (
        current.visible
        && current.left === nextLeft
        && current.width === nextWidth
      ) {
        return current;
      }

      const next = {
        animate: hasMeasuredRef.current,
        left: nextLeft,
        visible: true,
        width: nextWidth,
      };
      hasMeasuredRef.current = true;
      return next;
    });
  }, [activeValue]);

  useLayoutEffect(() => {
    measureIndicator();

    const list = listRef.current;
    const trigger = activeValue === undefined
      ? undefined
      : triggerRefs.current.get(activeValue);
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(measureIndicator);

    if (list !== null) observer?.observe(list);
    if (trigger !== undefined) observer?.observe(trigger);
    globalThis.addEventListener('resize', measureIndicator);

    return () => {
      observer?.disconnect();
      globalThis.removeEventListener('resize', measureIndicator);
    };
  }, [activeValue, items, measureIndicator]);

  const handleValueChange = (nextValue: string) => {
    setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };

  const indicatorStyle: CSSProperties = {
    opacity: indicatorLayout.visible ? 1 : 0,
    transform: `translateX(${indicatorLayout.left}px)`,
    transitionDuration: indicatorLayout.animate
      ? 'var(--design-motion-slow)'
      : '0ms',
    width: indicatorLayout.width,
  };

  return (
    <TabsPrimitive.Root
      {...(defaultValue === undefined ? {} : { defaultValue })}
      onValueChange={handleValueChange}
      {...(value === undefined ? {} : { value })}
    >
      <TabsPrimitive.List
        aria-label="보기 전환"
        className="relative flex gap-1 border-b border-border"
        ref={listRef}
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            className={`min-h-[var(--layout-control-height)] transform-gpu py-2 font-semibold text-muted transition-[color,transform] duration-[var(--design-motion-fast)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 data-[state=active]:text-foreground ${density === 'compact' ? 'min-w-0 flex-auto whitespace-nowrap px-1 text-xs' : 'px-3 text-sm'}`}
            key={item.value}
            ref={(node) => {
              if (node === null) {
                triggerRefs.current.delete(item.value);
              } else {
                triggerRefs.current.set(item.value, node);
              }
            }}
            value={item.value}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-foreground transition-[width,transform,opacity] ease-[var(--design-ease-enter)] motion-reduce:transition-none"
          data-tabs-indicator
          style={indicatorStyle}
        />
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content className={density === 'compact' ? 'pt-3' : 'pt-4'} key={item.value} value={item.value}>
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
