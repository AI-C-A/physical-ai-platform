import { describe, expect, it } from 'vitest';

import { validateCollectionSetup } from './collection-setup-validation';

const valid = { name: '과일 분류', instruction: '과일을 분류하세요.' };

describe('수집 설정 검증', () => {
  it('작업 및 장치 ID 없이 작업 정보만으로 생성할 수 있다', () => {
    expect(validateCollectionSetup(valid)).toEqual({});
  });
  it('공백뿐인 필수 항목을 거절한다', () => {
    expect(validateCollectionSetup({ ...valid, name: '  ' })).toEqual({ name: '세션 이름을 입력하세요.' });
  });
});
