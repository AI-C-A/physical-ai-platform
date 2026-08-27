import type { BrandingConfig } from '@/shared/config';

import type { ApplicationServices } from './composition/application-services';
import { AppProviders } from './providers';
import { AppRouter } from './router';

interface AppProps {
  readonly branding: BrandingConfig;
  readonly services: ApplicationServices;
}

export function App({ branding, services }: AppProps) {
  return (
    <AppProviders branding={branding} services={services}>
      <AppRouter />
    </AppProviders>
  );
}
