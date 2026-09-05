import { describe, expect, it } from 'vitest';

import type { RobotDescriptor, RobotOperationalStatus } from '@/entities/robot';

import { filterMonitoringRobots, getMonitoringRobotHealth, needsMonitoringAttention } from './monitoring-robot-health';

function status(battery: number, overrides: Partial<RobotOperationalStatus['data']> = {}): RobotOperationalStatus {
  return {
    robotId: 'robot-1',
    integrationProfileId: 'test',
    receivedTimestampMs: 1,
    data: { id: 1, battery, isConnecting: true, isCharging: false, latitude: null, longitude: null, name: null, nickname: null, serialNumber: null, ...overrides },
  };
}

const robots: readonly RobotDescriptor[] = [
  { id: 'a', displayName: '기체 A', serialNumber: 'SN-100', name: 'Alpha', integrationProfileId: 'test' },
  { id: 'b', displayName: '기체 B', serialNumber: 'SN-200', name: 'Beta', integrationProfileId: 'test' },
  { id: 'c', displayName: '기체 C', serialNumber: null, name: null, integrationProfileId: 'test' },
];

describe('관제 기체 상태와 목록', () => {
  it('20% 이하 미충전 기체와 연결 끊김을 확인 대상으로 분류한다', () => {
    expect(needsMonitoringAttention(status(20))).toBe(true);
    expect(needsMonitoringAttention(status(21))).toBe(false);
    expect(needsMonitoringAttention(status(5, { isCharging: true }))).toBe(false);
    expect(getMonitoringRobotHealth(status(90, { isConnecting: false })).label).toBe('연결 끊김');
  });

  it('지연되거나 없는 상태를 정상 연결로 표시하지 않는다', () => {
    expect(getMonitoringRobotHealth(status(90), true).label).toBe('수신 지연');
    expect(needsMonitoringAttention(status(90), true)).toBe(true);
    expect(getMonitoringRobotHealth(null).label).toBe('상태 미수신');
    expect(needsMonitoringAttention(undefined)).toBe(true);
  });

  it.each([-1, 101, NaN, Infinity])('유효하지 않은 배터리 %s를 표시하지 않는다', (battery) => {
    const health = getMonitoringRobotHealth(status(battery));
    expect(health.battery).toBeNull();
    expect(health.label).toBe('배터리 미수신');
  });

  it('기체 번호와 원래 이름으로 검색하며 원본 순서를 변경하지 않는다', () => {
    const options = { robots, statuses: {}, staleRobotIds: new Set<string>(), filter: 'all', sort: 'name' } as const;
    expect(filterMonitoringRobots({ ...options, search: ' sn-200 ' }).map((robot) => robot.id)).toEqual(['b']);
    expect(filterMonitoringRobots({ ...options, search: 'ALPHA' }).map((robot) => robot.id)).toEqual(['a']);
    expect(robots.map((robot) => robot.id)).toEqual(['a', 'b', 'c']);
  });

  it('배터리 낮은 순에서 미수신을 마지막에 두고 주의 필터에 지연 기체를 포함한다', () => {
    const options = { robots, statuses: { a: status(90), b: status(10), c: null }, staleRobotIds: new Set(['a']), search: '' };
    expect(filterMonitoringRobots({ ...options, filter: 'all', sort: 'battery' }).map((robot) => robot.id)).toEqual(['b', 'a', 'c']);
    expect(filterMonitoringRobots({ ...options, filter: 'attention', sort: 'attention' }).map((robot) => robot.id)).toEqual(['a', 'c', 'b']);
  });
});
