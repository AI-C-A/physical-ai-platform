import { describe, expect, it } from 'vitest';

import { getQuestRuntimeModeLabel } from './hand-pose-display';

describe('getQuestRuntimeModeLabel', () => {
  it('Collector 실행 환경을 운영자가 읽을 수 있는 이름으로 표시한다', () => {
    expect(getQuestRuntimeModeLabel('webxr')).toBe('WebXR');
    expect(getQuestRuntimeModeLabel('simulated')).toBe('시뮬레이션');
    expect(getQuestRuntimeModeLabel('unavailable')).toBe('사용 불가');
  });
});
