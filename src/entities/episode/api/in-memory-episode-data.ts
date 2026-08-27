import type { ClockPort } from '@/shared/lib/clock';

import type { Episode } from '../model/episode';
import { InMemoryEpisodeRepository } from './in-memory-episode-repository';

export function createInMemoryEpisodeRepository(clock: ClockPort): InMemoryEpisodeRepository {
  const anchorMs = clock.nowMs();
  const episodes: readonly Episode[] = Array.from({ length: 24 }, (_, index) => {
    const environment = index % 4 === 0 ? 'simulation' as const : 'physical' as const;
    return {
      id: `episode-${String(index + 1).padStart(3, '0')}`,
      name: `수집 에피소드 ${String(index + 1).padStart(2, '0')}`,
      captureSessionId: `session-${String(index + 1).padStart(3, '0')}`,
      robotId: `robot-${String((index % 8) + 1).padStart(3, '0')}`,
      sensorDeviceId: `sensor-rig-${String((index % 4) + 1).padStart(3, '0')}`,
      integrationProfileId: index % 2 === 0 ? 'multisensor-rig-v1' : 'vision-rig-v1',
      provenance: {
        environment,
        deliveryMode: index % 5 === 0 ? 'replay' as const : 'live' as const,
        controlMode: index % 3 === 0 ? 'teleop' as const : 'autonomous' as const,
        dataOrigin: environment === 'simulation' ? 'synthetic' as const : index % 6 === 0 ? 'derived' as const : 'captured' as const,
      },
      createdAtMs: anchorMs - index * 18 * 60 * 60 * 1000,
      durationMs: 45_000 + (index % 5) * 15_000,
      bytesWritten: 24_000_000 + index * 1_250_000,
      streams: [
        { id: 'pose', displayName: '위치', bytesWritten: 2_000_000, observedRateHz: 20 },
        { id: 'battery', displayName: '배터리', bytesWritten: 100_000, observedRateHz: 1 },
        { id: 'imu', displayName: 'IMU', bytesWritten: 8_000_000, observedRateHz: 20 },
      ],
    };
  });
  return new InMemoryEpisodeRepository(episodes);
}
