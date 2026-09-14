import { useState } from 'react';

import { Icon } from '@/shared/ui/icon';

import type { RobotDescriptor } from '../model/robot';

export function RobotCompanyAvatar({ robot, showTitle = true }: { readonly robot: RobotDescriptor; readonly showTitle?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const company = robot.company;
  const logoUrl = company?.logoUrl;
  const showLogo = logoUrl !== undefined && logoUrl !== failedUrl;

  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-muted"
      title={showTitle ? company?.name : undefined}
    >
      {showLogo ? (
        <img
          alt=""
          className="size-6 object-contain"
          height={24}
          onError={() => setFailedUrl(logoUrl)}
          src={logoUrl}
          width={24}
        />
      ) : (
        <Icon name="robot" size="md" />
      )}
    </span>
  );
}
