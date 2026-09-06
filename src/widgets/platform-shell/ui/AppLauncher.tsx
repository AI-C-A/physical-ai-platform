import { useRef } from 'react';

import { useBranding } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { Menu } from '@/shared/ui/dropdown';
import { Icon } from '@/shared/ui/icon';

import type { MiniAppNavigationItem } from './platform-shell';

interface AppLauncherProps {
  readonly currentMiniApp: MiniAppNavigationItem;
  readonly miniApps: readonly MiniAppNavigationItem[];
  readonly onSelect: (miniApp: MiniAppNavigationItem) => void;
}

export function AppLauncher({ currentMiniApp, miniApps, onSelect }: AppLauncherProps) {
  const branding = useBranding();
  const pendingNavigation = useRef<MiniAppNavigationItem | null>(null);

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button
          aria-label={`미니앱 전환 · ${currentMiniApp.label}`}
          className="min-h-12 max-w-full shrink-0 justify-start gap-2 px-3 py-2 text-left"
          title={`앱 전환 · ${currentMiniApp.label}`}
          variant="ghost"
        >
          <span className="min-w-0 truncate text-xl font-semibold leading-7">{currentMiniApp.label}</span>
          <span className="shrink-0 text-muted"><Icon name="chevron-down" size="md" /></span>
        </Button>
      </Menu.Trigger>
      <Menu.Content
        align="start"
        aria-label="앱 전환"
        width="wide"
        onCloseAutoFocus={(event) => {
          const destination = pendingNavigation.current;
          if (destination === null) return;
          pendingNavigation.current = null;
          event.preventDefault();
          onSelect(destination);
        }}
        side="bottom"
      >
        <Menu.Label>
          {branding.productName}
        </Menu.Label>
        {miniApps.map((miniApp) => {
          const isCurrent = miniApp.id === currentMiniApp.id;
          return (
            <Menu.Item
              selected={isCurrent}
              label={miniApp.label}
              {...(miniApp.description ? { description: miniApp.description } : {})}
              key={miniApp.id}
              onSelect={() => {
                if (isCurrent) return;
                pendingNavigation.current = miniApp;
              }}
            />
          );
        })}
      </Menu.Content>
    </Menu.Root>
  );
}
