import { describe, expect, it } from 'vitest';

import {
  formatDateTime,
  formatRateHertz,
  formatRelativeTime,
  getDisplayTimeZoneLabel,
} from './format';

describe('format', () => {
  it('값이 없는 rate에 단위를 붙이지 않는다', () => {
    expect(formatRateHertz(null)).toBe('—');
    expect(formatRateHertz(20)).toBe('20.0 Hz');
  });

  it('epoch timestamp를 브라우저 시간대로 표시한다', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(0)).not.toBe('—');
    expect(getDisplayTimeZoneLabel().length).toBeGreaterThan(0);
  });

  it('최근 수신 시각을 상대 시각으로 표시한다', () => {
    const now = 100_000;
    expect(formatRelativeTime(null, now)).toBe('수신 기록 없음');
    expect(formatRelativeTime(98_000, now)).toBe('방금 전');
    expect(formatRelativeTime(88_000, now)).toBe('12초 전');
    expect(formatRelativeTime(0, now)).toBe('1분 전');
  });
});
