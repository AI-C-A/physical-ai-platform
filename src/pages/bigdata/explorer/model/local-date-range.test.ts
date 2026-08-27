import { describe, expect, it } from 'vitest';

import {
  formatLocalDateInput,
  parseLocalDateEnd,
  parseLocalDateStart,
} from './local-date-range';

describe('local date range', () => {
  it('브라우저 지역 날짜를 입력 형식과 epoch millisecond로 변환한다', () => {
    const midday = new Date(2026, 7, 24, 12).getTime();
    expect(formatLocalDateInput(midday)).toBe('2026-08-24');

    const startMs = parseLocalDateStart('2026-08-24');
    const endMs = parseLocalDateEnd('2026-08-24');
    expect(startMs).not.toBeNull();
    expect(endMs).not.toBeNull();
    expect(endMs! - startMs! + 1).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(endMs! - startMs! + 1).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });

  it('존재하지 않는 날짜를 거부한다', () => {
    expect(parseLocalDateStart('2026-02-30')).toBeNull();
    expect(parseLocalDateEnd('not-a-date')).toBeNull();
  });
});
