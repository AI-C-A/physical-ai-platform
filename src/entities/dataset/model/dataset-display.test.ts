import { describe, expect, it } from 'vitest';

import { getDatasetStatusLabel } from './dataset-display';

describe('dataset display', () => {
  it('내부 상태를 사용자 문구로 표시한다', () => {
    expect(getDatasetStatusLabel('draft')).toBe('초안');
  });
});
