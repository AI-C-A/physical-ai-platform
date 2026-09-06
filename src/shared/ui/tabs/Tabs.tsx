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
  readonly count?: number;
  readonly label: string;
  readonly value: string;
}

interface TabsProps {
  readonly 'aria-label'?: string;
  readonly actions?: ReactNode;
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

export function Tabs({ 'aria-label': ariaLabel = '보기 전환', actions, defaultValue, density = 'normal', items, onValueChange, value }: TabsProps) {
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
      className="min-w-0"
      {...(defaultValue === undefined ? {} : { defaultValue })}
      onValueChange={handleValueChange}
      {...(value === undefined ? {} : { value })}
    >
      <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-4 border-b border-border">
        <div className="min-w-0 max-w-full flex-auto overflow-x-auto">
          <TabsPrimitive.List
            aria-label={ariaLabel}
            className="relative flex gap-1"
            ref={listRef}
          >
            {items.map((item) => (
              <TabsPrimitive.Trigger
                aria-label={item.count === undefined ? undefined : `${item.label} ${String(item.count)}개`}
                className={`ui-pressable ui-focus-inset min-h-[var(--layout-control-height)] shrink-0 whitespace-nowrap rounded-[var(--design-radius-control)] py-2 font-semibold text-muted data-[state=active]:text-foreground ${density === 'compact' ? 'min-w-0 flex-auto px-1 text-xs' : 'px-3 text-sm'}`}
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
                {item.count === undefined ? null : <span className="ml-1 text-xs tabular-nums text-muted">{item.count}</span>}
              </TabsPrimitive.Trigger>
            ))}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-foreground transition-[width,transform,opacity] ease-[var(--design-ease-release)] motion-reduce:transition-none"
              data-tabs-indicator
              style={indicatorStyle}
            />
          </TabsPrimitive.List>
        </div>
        {actions === undefined ? null : <div className="ml-auto shrink-0">{actions}</div>}
      </div>
      {items.map((item) => (
        <TabsPrimitive.Content className={`ui-focus-inset ${density === 'compact' ? 'pt-3' : 'pt-4'}`} key={item.value} value={item.value}>
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
