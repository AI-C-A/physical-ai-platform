import {
  createInMemoryRobotCatalogWithData,
  createInMemoryRobotOperationalStatusWithData,
  inMemoryRobotIds,
  inMemoryRobotLocations,
} from '@/entities/robot';
import {
  InMemoryRobotGeolocationQuery,
  InMemoryTelemetryAdapter,
} from '@/entities/robot-telemetry';
import type { ClockPort } from '@/shared/lib/clock';
import { systemScheduler, type Scheduler } from '@/shared/lib/scheduler';

export function createInMemoryAdapterFactories(clock: ClockPort) {
  const scheduler: Scheduler = {
    ...systemScheduler,
    now: () => clock.nowMs(),
  };
  const robotTelemetry = new InMemoryTelemetryAdapter(inMemoryRobotIds, {
    scheduler,
  });

  return {
    services: {
      robotCatalog: createInMemoryRobotCatalogWithData(),
      robotOperationalStatus: createInMemoryRobotOperationalStatusWithData(clock),
      robotTelemetry,
      robotGeolocation: new InMemoryRobotGeolocationQuery(
        clock,
        inMemoryRobotLocations,
      ),
    },
    dispose: () => robotTelemetry.dispose(),
  };
}
