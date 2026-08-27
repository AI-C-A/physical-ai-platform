import { describe, expect, it, vi } from 'vitest';

import { inMemoryRobotIds } from '@/entities/robot';
import { InMemoryRobotVideoAdapter } from '@/entities/robot-video';
import type { RuntimeConfig } from '@/shared/config';
import type { ClockPort } from '@/shared/lib/clock';

import {
  describeAdapterBundleContract,
} from './adapter-contract-test-kit';
import {
  createApplicationServices,
  type ApplicationServices,
} from './application-services';

type AdapterBundle = Omit<ApplicationServices, 'clock' | 'dispose'>;

// fake timer의 system time을 따라가야 timer 기반 Port의 경과 시간이 실제로 전진한다.
const clock: ClockPort = { nowMs: () => Date.now() };

const createConfig = (
  implementation: 'in-memory' | 'external',
): RuntimeConfig => ({
  branding: {
    productName: 'ARMY-ROBOT',
    shortName: 'ARMY-ROBOT',
    logo: null,
  },
  adapters: { mode: 'bundle', implementation },
  connections: {
    patrol: { endpoint: null },
    telemetry: { endpoint: null, integrationProfileId: null },
    video: { endpoint: null },
    capture: { endpoint: null },
  },
});

function createTestVideoAdapter(): InMemoryRobotVideoAdapter {
  return new InMemoryRobotVideoAdapter(inMemoryRobotIds, () => {
    let readyState: MediaStreamTrackState = 'live';
    const track = {
      get readyState() {
        return readyState;
      },
      stop: vi.fn(() => {
        readyState = 'ended';
      }),
    } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    return { stream, stop: () => track.stop() };
  });
}

function toBundle(services: ApplicationServices): AdapterBundle {
  return {
    robotCatalog: services.robotCatalog,
    robotOperationalStatus: services.robotOperationalStatus,
    sensorDeviceCatalog: services.sensorDeviceCatalog,
    robotTelemetry: services.robotTelemetry,
    robotGeolocation: services.robotGeolocation,
    robotVideo: services.robotVideo,
    captureOperations: services.captureOperations,
    datasetRepository: services.datasetRepository,
    episodeRepository: services.episodeRepository,
    robotEventRepository: services.robotEventRepository,
    analytics: services.analytics,
  };
}

function createInMemoryContractServices(): ApplicationServices {
  return {
    ...createApplicationServices(createConfig('in-memory'), { clock }),
    robotVideo: createTestVideoAdapter(),
  };
}

function createExternalShapeContractServices(): ApplicationServices {
  const source = createInMemoryContractServices();
  return createApplicationServices(createConfig('external'), {
    clock,
    externalAdapterFactory: () => toBundle(source),
  });
}

describeAdapterBundleContract('in-memory', createInMemoryContractServices);
describeAdapterBundleContract(
  'external shape test double',
  createExternalShapeContractServices,
);

describe('Adapter bundle composition contract', () => {
  it('external bundle은 등록된 factory의 모든 Port를 그대로 사용한다', () => {
    const source = createInMemoryContractServices();
    const services = createApplicationServices(createConfig('external'), {
      clock,
      externalAdapterFactory: () => toBundle(source),
    });

    expect(toBundle(services)).toEqual(toBundle(source));
  });

  it('external factory 결과에 선택한 subsystem이 없으면 자동 fallback하지 않는다', () => {
    expect(() =>
      createApplicationServices(createConfig('external'), {
        clock,
        externalAdapterFactory: () => ({} as unknown as AdapterBundle),
      }),
    ).toThrow('subsystem: robotCatalog');
  });
});
