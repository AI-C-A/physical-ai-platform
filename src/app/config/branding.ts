import type { BrandingConfig } from '@/shared/config';

export const DEFAULT_BRANDING = {
  productName: 'ROBOT Army TIGER+',
  shortName: 'ROBOT Army TIGER+',
  logo: '/assets/army-tiger-symbol-light.png',
  logoDark: '/assets/army-tiger-symbol-dark.png',
} as const satisfies BrandingConfig;
