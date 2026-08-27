import { describe, expect, it } from 'vitest';

import { calculateHeapTrendBytesPerMs } from './soak-metrics';

describe('soak heap 추세', () => {
  it('불규칙한 시간 간격을 실제 경과 시간으로 회귀한다', () => {
    expect(calculateHeapTrendBytesPerMs([
      { elapsedMs: 0, usedBytes: 1_000 },
      { elapsedMs: 1_000, usedBytes: 101_000 },
      { elapsedMs: 4_000, usedBytes: 401_000 },
      { elapsedMs: 4_250, usedBytes: 426_000 },
    ])).toBeCloseTo(100);
  });

  it('경과 시간이 같은 표본의 상승 추세를 0으로 처리한다', () => {
    expect(calculateHeapTrendBytesPerMs([
      { elapsedMs: 1_000, usedBytes: 1_000 },
      { elapsedMs: 1_000, usedBytes: 2_000 },
    ])).toBe(0);
  });
});
