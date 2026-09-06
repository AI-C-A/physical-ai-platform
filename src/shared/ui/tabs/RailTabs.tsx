import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { Icon, type IconName } from '@/shared/ui/icon';

import './tab-rail.css';

interface RailTabsProps extends Omit<ComponentProps<typeof TabsPrimitive.Root>, 'orientation' | 'activationMode'> {
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}

export function RailTabs(props: RailTabsProps) {
  return <TabsPrimitive.Root {...props} orientation="vertical" activationMode="manual" />;
}

export function RailTabList({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <TabsPrimitive.List {...props} className={`tab-rail ${className}`}>{children}</TabsPrimitive.List>;
}

interface RailTabProps {
  readonly count?: number;
  readonly icon: IconName;
  readonly id: string;
  readonly label: string;
  readonly onReselect?: () => void;
  readonly shortLabel: string;
  readonly value: string;
}

export function RailTab({ count = 0, icon, id, label, onReselect, shortLabel, value }: RailTabProps) {
  const accessibleLabel = count > 0 ? `${label} · ${String(count)}` : label;
  return (
    <TabsPrimitive.Trigger
      id={id}
      value={value}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className="ui-pressable tab-rail-trigger"
      onMouseDown={(event) => {
        if (onReselect !== undefined && event.button === 0 && !event.ctrlKey && event.currentTarget.dataset.state === 'active') {
          event.preventDefault();
          onReselect();
        }
      }}
      onKeyDown={(event) => {
        if (onReselect === undefined || (event.key !== 'Enter' && event.key !== ' ')) return;
        if (event.repeat) {
          event.preventDefault();
        } else if (event.currentTarget.dataset.state === 'active') {
          event.preventDefault();
          onReselect();
        }
      }}
    >
      <Icon name={icon} size="md" />
      <span>{shortLabel}</span>
      {count > 0 ? <span aria-hidden="true" className="tab-rail-count">{count}</span> : null}
    </TabsPrimitive.Trigger>
  );
}

interface RailTabPanelProps {
  readonly children: ReactNode;
  readonly forceMount?: true;
  readonly hidden?: boolean;
  readonly labelledBy: string;
  readonly value: string;
}

export function RailTabPanel({ labelledBy, ...props }: RailTabPanelProps) {
  return <TabsPrimitive.Content {...props} aria-labelledby={labelledBy} />;
}
