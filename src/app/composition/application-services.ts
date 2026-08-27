import {
  type RobotCatalogPort,
  type RobotOperationalStatusQueryPort,
} from '@/entities/robot';
import {
  type RobotGeolocationQueryPort,
  type RobotTelemetryPort,
} from '@/entities/robot-telemetry';
import type { RuntimeConfig } from '@/shared/config';
import { systemClock, type ClockPort } from '@/shared/lib/clock';

import { createInMemoryAdapterFactories } from './in-memory-adapter-factories';

export interface ApplicationServices {
  readonly clock: ClockPort;
  readonly robotCatalog: RobotCatalogPort;
  readonly robotOperationalStatus: RobotOperationalStatusQueryPort;
  readonly robotTelemetry: RobotTelemetryPort;
  readonly robotGeolocation: RobotGeolocationQueryPort;
  dispose(): void;
}

interface CreateApplicationServicesOptions {
  readonly clock?: ClockPort;
}

export function createApplicationServices(
  runtimeConfig: RuntimeConfig,
  options: CreateApplicationServicesOptions = {},
): ApplicationServices {
  if (runtimeConfig.adapters.implementation !== 'in-memory') {
    throw new Error('external Adapter factory가 아직 등록되지 않았습니다.');
  }

  const clock = options.clock ?? systemClock;
  const adapters = createInMemoryAdapterFactories(clock);
  let disposed = false;
  return {
    clock,
    ...adapters.services,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      adapters.dispose();
    },
  };
}
