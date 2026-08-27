import { describe, expect, it } from 'vitest';

import {
  getCapturePreflightStatusLabel,
  getCaptureSessionStatusLabel,
  getCaptureStreamStatusLabel,
} from './capture-session-display';

describe('capture session display', () => {
  it('내부 상태를 사용자 문구로 표시한다', () => {
    expect(getCaptureSessionStatusLabel('finalizing')).toBe('기록 마감 중');
    expect(getCaptureStreamStatusLabel('stale')).toBe('최신성 확인 필요');
    expect(getCapturePreflightStatusLabel('passed')).toBe('통과');
  });
});
