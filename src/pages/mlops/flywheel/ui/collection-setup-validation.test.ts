import { describe, expect, it } from 'vitest';

import { validateCollectionSetup } from './collection-setup-validation';

const valid = {
  name: '과일 분류', taskId: 'sort-fruit', instruction: '과일을 분류하세요.',
  exoskeletonDeviceId: 'exo-1', questDeviceId: 'quest-1', headCameraDeviceId: 'camera-1',
  externalCameraDeviceId: '',
};

describe('수집 설정 검증', () => {
  it('공백만 있는 필수 항목과 중복된 장치 ID를 한 번에 안내한다', () => {
    expect(validateCollectionSetup({ ...valid, name: '  ', questDeviceId: ' camera-1 ' })).toEqual({
      name: '세션 이름을 입력하세요.',
      questDeviceId: '장치마다 서로 다른 ID를 입력하세요.',
      headCameraDeviceId: '장치마다 서로 다른 ID를 입력하세요.',
    });
  });

  it('선택 카메라는 비워둘 수 있고 입력한 경우 중복 검증에 포함한다', () => {
    expect(validateCollectionSetup(valid)).toEqual({});
    expect(validateCollectionSetup({ ...valid, externalCameraDeviceId: 'exo-1' })).toHaveProperty('externalCameraDeviceId');
  });
});
