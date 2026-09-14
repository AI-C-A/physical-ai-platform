import { useState } from 'react';

import { Icon } from '@/shared/ui/icon';

import type { RobotDescriptor } from '../model/robot';

export function RobotCompanyAvatar({ robot }: { readonly robot: RobotDescriptor }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const company = robot.company;
  const showLogo = company !== undefined && company.logoUrl !== failedUrl;

  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground/[0.06] text-muted"
      title={company?.name}
    >
      {showLogo ? (
        <img
          alt=""
          className="size-6 object-contain"
          height={24}
          onError={() => setFailedUrl(company.logoUrl)}
          src={company.logoUrl}
          width={24}
        />
      ) : (
        <Icon name="robot" size="md" />
      )}
    </span>
  );
}
