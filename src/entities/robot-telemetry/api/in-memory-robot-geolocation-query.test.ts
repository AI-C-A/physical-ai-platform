import { describe, expect, it } from 'vitest';

import { isValidRobotGeolocation } from '../model/robot-telemetry';
import { InMemoryRobotGeolocationQuery } from './in-memory-robot-geolocation-query';

describe('InMemoryRobotGeolocationQuery', () => {
  const locations = {
    'robot-001': { latitude: 37.39472, longitude: 127.11153 },
    'robot-002': { latitude: 37.39518, longitude: 127.11214 },
    'robot-003': { latitude: 37.39431, longitude: 127.11242 },
    'robot-004': { latitude: 37.39386, longitude: 127.11172 },
    'robot-005': { latitude: 37.39408, longitude: 127.11091 },
    'robot-006': { latitude: 37.39463, longitude: 127.11039 },
    'robot-007': { latitude: 37.39516, longitude: 127.1107 },
    'robot-008': { latitude: 37.39552, longitude: 127.11142 },
  } as const;
  const query = new InMemoryRobotGeolocationQuery(
    { nowMs: () => 1_700_000_000_000 },
    locations,
  );

  it('모든 Mock Robot에 판교역 인근의 서로 다른 합성 위치를 제공한다', async () => {
    const robotIds = [
      'robot-001',
      'robot-002',
      'robot-003',
      'robot-004',
      'robot-005',
      'robot-006',
      'robot-007',
      'robot-008',
    ] as const;
    const locations = await Promise.all(
      robotIds.map((robotId) => query.getGeolocationObservation(robotId)),
    );

    locations.forEach((location, index) => {
      expect(location).not.toBeNull();
      expect(location?.robotId).toBe(robotIds[index]);
      expect(location === null ? false : isValidRobotGeolocation(location)).toBe(true);
      expect(Math.abs((location?.latitudeDegrees ?? 0) - 37.39472)).toBeLessThan(0.01);
      expect(Math.abs((location?.longitudeDegrees ?? 0) - 127.11153)).toBeLessThan(0.01);
    });
    expect(new Set(locations.map((location) => JSON.stringify([
      location?.latitudeDegrees,
      location?.longitudeDegrees,
    ]))).size).toBe(robotIds.length);
  });

  it('Mock 목록에 없는 Robot 위치를 만들지 않는다', async () => {
    await expect(
      query.getGeolocationObservation('unknown-robot'),
    ).resolves.toBeNull();
  });
});
