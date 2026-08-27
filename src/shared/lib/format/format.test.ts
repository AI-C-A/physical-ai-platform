import { describe, expect, it } from 'vitest';

import { formatDateTime, formatRateHertz, getDisplayTimeZoneLabel } from './format';

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
});
