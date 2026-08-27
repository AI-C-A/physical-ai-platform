import { describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@/shared/config';
import type { ClockPort } from '@/shared/lib/clock';

import { DEFAULT_BRANDING } from '../config';
import { createApplicationServices } from './application-services';

function createConfig(implementation: 'in-memory' | 'external'): RuntimeConfig {
  return {
    branding: DEFAULT_BRANDING,
    adapters: { mode: 'bundle', implementation },
    connections: {
      patrol: { endpoint: null },
      telemetry: { endpoint: null, integrationProfileId: null },
      video: { endpoint: null },
      capture: { endpoint: null },
    },
  };
}

describe('createApplicationServices', () => {
  it('인메모리 로봇과 고정 Mock 위치를 조립한다', async () => {
    const services = createApplicationServices(createConfig('in-memory'), {
      clock: { nowMs: () => 1_000 } satisfies ClockPort,
    });

    await expect(services.robotCatalog.getRobot('robot-001')).resolves.toMatchObject({
      id: 'robot-001',
    });
    await expect(services.robotGeolocation.getGeolocationObservation('robot-001')).resolves.toMatchObject({
      latitudeDegrees: 37.39472,
      longitudeDegrees: 127.11153,
    });
    expect(() => {
      services.dispose();
      services.dispose();
    }).not.toThrow();
  });

  it('등록되지 않은 external 구현으로 자동 fallback하지 않는다', () => {
    expect(() => createApplicationServices(createConfig('external'))).toThrow(
      'external Adapter factory가 등록되지 않았습니다.',
    );
  });
});
