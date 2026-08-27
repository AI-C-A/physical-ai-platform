import { describe, expect, it } from 'vitest';

import { calculateCompositeGridCrop } from './composite-grid-video';

describe('calculateCompositeGridCrop', () => {
  it('3×2 합성 영상에서 요청한 cell의 원본 pixel 영역을 계산한다', () => {
    expect(calculateCompositeGridCrop(1_920, 1_080, {
      column: 0,
      columns: 3,
      row: 0,
      rows: 2,
    })).toEqual({ height: 540, width: 640, x: 0, y: 0 });
    expect(calculateCompositeGridCrop(1_920, 1_080, {
      column: 2,
      columns: 3,
      row: 1,
      rows: 2,
    })).toEqual({ height: 540, width: 640, x: 1_280, y: 540 });
  });

  it('해상도가 grid에 나누어떨어지지 않아도 마지막 cell까지 pixel을 잃지 않는다', () => {
    expect(calculateCompositeGridCrop(10, 5, {
      column: 2,
      columns: 3,
      row: 1,
      rows: 2,
    })).toEqual({ height: 3, width: 4, x: 6, y: 2 });
  });

  it('grid 밖 cell은 거절한다', () => {
    expect(() => calculateCompositeGridCrop(1_920, 1_080, {
      column: 3,
      columns: 3,
      row: 0,
      rows: 2,
    })).toThrow('grid 범위');
  });
});
