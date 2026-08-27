import { describe, expect, it } from 'vitest';

import {
  createRecordSetSearchKey,
  paginate,
  readAllowedValue,
  readPositivePage,
} from './collection-query';

describe('collection query', () => {
  it('잘못된 URL page를 1로 정규화한다', () => {
    expect(readPositivePage(null)).toBe(1);
    expect(readPositivePage('NaN')).toBe(1);
    expect(readPositivePage('-2')).toBe(1);
    expect(readPositivePage('2.5')).toBe(1);
    expect(readPositivePage('3')).toBe(3);
  });

  it('페이지를 결과 범위로 제한하고 기본 20개 단위로 자른다', () => {
    const records = Array.from({ length: 42 }, (_, index) => index + 1);

    expect(paginate(records, 2, 20)).toEqual({
      items: records.slice(20, 40),
      page: 2,
      totalPages: 3,
    });
    expect(paginate(records, 99, 20)).toMatchObject({ page: 3 });
  });

  it('URL option은 허용된 값만 유지한다', () => {
    const values = ['newest', 'oldest'] as const;

    expect(readAllowedValue('oldest', values, 'newest')).toBe('oldest');
    expect(readAllowedValue('unknown', values, 'newest')).toBe('newest');
    expect(readAllowedValue(null, values, 'newest')).toBe('newest');
  });

  it('내보내기 결과 집합 키는 page만 제외하고 파라미터 순서를 정규화한다', () => {
    expect(createRecordSetSearchKey(
      new URLSearchParams('page=3&sort=newest&search=alpha'),
    )).toBe('search=alpha&sort=newest');
    expect(createRecordSetSearchKey(
      new URLSearchParams('search=alpha&sort=newest&page=1'),
    )).toBe('search=alpha&sort=newest');
    expect(createRecordSetSearchKey(
      new URLSearchParams('search=beta&sort=newest&page=1'),
    )).not.toBe('search=alpha&sort=newest');
  });
});
