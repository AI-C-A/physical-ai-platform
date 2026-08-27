import { type PropsWithChildren, useEffect, useRef } from 'react';

import {
  RobotCatalogContext,
  RobotOperationalStatusContext,
} from '@/entities/robot';
import {
  RobotGeolocationContext,
  RobotTelemetryContext,
} from '@/entities/robot-telemetry';
import { BrandingContext, type BrandingConfig } from '@/shared/config';
import { ClockContext } from '@/shared/lib/clock';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import type { ApplicationServices } from '../composition/application-services';

interface AppProvidersProps extends PropsWithChildren {
  readonly branding: BrandingConfig;
  readonly services: ApplicationServices;
}

export function AppProviders({
  children,
  branding,
  services,
}: AppProvidersProps) {
  const lifecycleGenerationRef = useRef(0);
  const currentServicesRef = useRef(services);

  useEffect(() => {
    currentServicesRef.current = services;
    lifecycleGenerationRef.current += 1;
    const generation = lifecycleGenerationRef.current;

    return () => {
      queueMicrotask(() => {
        const replaced = currentServicesRef.current !== services;
        const wasNotRemounted = lifecycleGenerationRef.current === generation;
        if (replaced || wasNotRemounted) services.dispose();
      });
    };
  }, [services]);

  return (
    <BrandingContext.Provider value={branding}>
      <ClockContext.Provider value={services.clock}>
        <RobotCatalogContext.Provider value={services.robotCatalog}>
          <RobotOperationalStatusContext.Provider value={services.robotOperationalStatus}>
          <RobotTelemetryContext.Provider value={services.robotTelemetry}>
            <RobotGeolocationContext.Provider value={services.robotGeolocation}>
              <TooltipProvider>
                <ToastProvider>{children}</ToastProvider>
              </TooltipProvider>
            </RobotGeolocationContext.Provider>
          </RobotTelemetryContext.Provider>
          </RobotOperationalStatusContext.Provider>
        </RobotCatalogContext.Provider>
      </ClockContext.Provider>
    </BrandingContext.Provider>
  );
}
