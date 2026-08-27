import { createContext, useContext } from 'react';

import type { BrandingConfig } from './runtime-config';

export const BrandingContext = createContext<BrandingConfig | null>(null);

export function useBranding(): BrandingConfig {
  const branding = useContext(BrandingContext);
  if (branding === null) throw new Error('BrandingProvider가 구성되지 않았습니다.');
  return branding;
}
