import { describe, expect, it } from 'vitest';

import {
  isValidRobotGeolocation,
  type RobotGeolocationObservation,
} from './robot-telemetry';

const validObservation: RobotGeolocationObservation = {
  robotId: 'robot-001',
  latitudeDegrees: 36.5,
  longitudeDegrees: 128,
  horizontalAccuracyMeters: null,
  sourceTimestampMs: null,
  receivedTimestampMs: 1_700_000_000_000,
};

describe('isValidRobotGeolocation', () => {
  it('nullable source 시각과 정확도를 가진 WGS84 표준 관측값을 허용한다', () => {
    expect(isValidRobotGeolocation(validObservation)).toBe(true);
    expect(
      isValidRobotGeolocation({
        ...validObservation,
        horizontalAccuracyMeters: 2.5,
        sourceTimestampMs: 1_699_999_999_900,
      }),
    ).toBe(true);
  });

  it.each([
    { field: '빈 Robot ID', value: { ...validObservation, robotId: '' } },
    {
      field: '위도 범위 초과',
      value: { ...validObservation, latitudeDegrees: 90.0001 },
    },
    {
      field: '경도 범위 초과',
      value: { ...validObservation, longitudeDegrees: -180.0001 },
    },
    {
      field: '음수 정확도',
      value: { ...validObservation, horizontalAccuracyMeters: -1 },
    },
    {
      field: '유한하지 않은 수신 시각',
      value: {
        ...validObservation,
        receivedTimestampMs: Number.POSITIVE_INFINITY,
      },
    },
  ])('$field 관측값을 거부한다', ({ value }) => {
    expect(isValidRobotGeolocation(value)).toBe(false);
  });
});
