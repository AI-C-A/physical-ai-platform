import type { BrandingConfig } from '@/shared/config';

export const DEFAULT_BRANDING = {
  productName: 'ROBOT Army TIGER+',
  shortName: 'ROBOT Army TIGER+',
  logo: '/assets/army-tiger-logo.png',
} as const satisfies BrandingConfig;
