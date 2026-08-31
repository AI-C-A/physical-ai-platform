import { type PropsWithChildren, useEffect, useRef } from 'react';

import { AnalyticsContext } from '@/entities/analytics';
import { CaptureOperationsContext } from '@/entities/capture-session';
import { DatasetRepositoryContext } from '@/entities/dataset';
import { EpisodeRepositoryContext } from '@/entities/episode';
import {
  PatrolApiStatusContext,
  RobotCatalogContext,
  RobotOperationalStatusContext,
} from '@/entities/robot';
import { RobotEventRepositoryContext } from '@/entities/robot-event';
import {
  RobotGeolocationContext,
  RobotTelemetryContext,
} from '@/entities/robot-telemetry';
import { RobotVideoContext } from '@/entities/robot-video';
import { SensorDeviceCatalogContext } from '@/entities/sensor-device';
import {
  BrandingContext,
  ColorSchemePreferenceProvider,
  type BrandingConfig,
} from '@/shared/config';
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
    <ColorSchemePreferenceProvider>
      <BrandingContext.Provider value={branding}>
        <ClockContext.Provider value={services.clock}>
      <PatrolApiStatusContext.Provider value={services.patrolApiStatus}>
        <RobotCatalogContext.Provider value={services.robotCatalog}>
        <RobotOperationalStatusContext.Provider value={services.robotOperationalStatus}>
        <SensorDeviceCatalogContext.Provider
          value={services.sensorDeviceCatalog}
        >
          <RobotTelemetryContext.Provider value={services.robotTelemetry}>
            <RobotGeolocationContext.Provider value={services.robotGeolocation}>
              <RobotVideoContext.Provider value={services.robotVideo}>
            <CaptureOperationsContext.Provider
              value={services.captureOperations}
            >
              <EpisodeRepositoryContext.Provider value={services.episodeRepository}>
                <DatasetRepositoryContext.Provider value={services.datasetRepository}>
                  <RobotEventRepositoryContext.Provider value={services.robotEventRepository}>
                    <AnalyticsContext.Provider value={services.analytics}>
                      <TooltipProvider>
                        <ToastProvider>{children}</ToastProvider>
                      </TooltipProvider>
                    </AnalyticsContext.Provider>
                  </RobotEventRepositoryContext.Provider>
                </DatasetRepositoryContext.Provider>
              </EpisodeRepositoryContext.Provider>
            </CaptureOperationsContext.Provider>
              </RobotVideoContext.Provider>
            </RobotGeolocationContext.Provider>
          </RobotTelemetryContext.Provider>
        </SensorDeviceCatalogContext.Provider>
        </RobotOperationalStatusContext.Provider>
        </RobotCatalogContext.Provider>
      </PatrolApiStatusContext.Provider>
        </ClockContext.Provider>
      </BrandingContext.Provider>
    </ColorSchemePreferenceProvider>
  );
}
