import { describe, expect, it } from 'vitest';

import {
  isMultiMonitoringSelectionMode,
  maximumMultiMonitoringRobotCount,
  normalizeMultiMonitoringRobotIds,
  readMultiMonitoringRobotIds,
  setMultiMonitoringSelectionMode,
  writeMultiMonitoringRobotIds,
} from './multi-monitoring-search-params';

describe('multi monitoring search params', () => {
  it('선택 순서를 유지하면서 빈 값과 중복을 제거하고 최대 6대로 제한한다', () => {
    expect(normalizeMultiMonitoringRobotIds([
      'robot-003',
      ' ',
      'robot-001',
      'robot-003',
      'robot-002',
      'robot-004',
      'robot-005',
      'robot-006',
      'robot-007',
    ])).toEqual([
      'robot-003',
      'robot-001',
      'robot-002',
      'robot-004',
      'robot-005',
      'robot-006',
    ]);
    expect(maximumMultiMonitoringRobotCount).toBe(6);
  });

  it('반복 robotId와 mode를 다른 검색 조건을 보존한 채 기록하고 해제한다', () => {
    const initial = new URLSearchParams('siteId=alpha&page=2');
    const selected = setMultiMonitoringSelectionMode(
      writeMultiMonitoringRobotIds(initial, ['robot-002', 'robot-001']),
      true,
    );

    expect(isMultiMonitoringSelectionMode(selected)).toBe(true);
    expect(readMultiMonitoringRobotIds(selected)).toEqual([
      'robot-002',
      'robot-001',
    ]);
    expect(selected.get('siteId')).toBe('alpha');
    expect(selected.get('page')).toBe('2');

    const cleared = setMultiMonitoringSelectionMode(selected, false);
    expect(isMultiMonitoringSelectionMode(cleared)).toBe(false);
    expect(readMultiMonitoringRobotIds(cleared)).toEqual([]);
    expect(cleared.get('siteId')).toBe('alpha');
  });
});
