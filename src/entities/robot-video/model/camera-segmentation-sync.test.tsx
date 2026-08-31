import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  setCameraSegmentationSync,
  useCameraSegmentationSync,
} from './camera-segmentation-sync';

describe('camera segmentation sync setting', () => {
  beforeEach(() => window.localStorage.clear());

  it('기본값은 비활성화하고 변경 값을 저장해 다음 mount에서도 유지한다', () => {
    const first = renderHook(() => useCameraSegmentationSync());
    expect(first.result.current).toBe(false);

    act(() => setCameraSegmentationSync(true));

    expect(first.result.current).toBe(true);
    expect(window.localStorage.getItem(
      'robot-army-tiger.camera-segmentation-sync',
    )).toBe('true');

    first.unmount();
    const second = renderHook(() => useCameraSegmentationSync());
    expect(second.result.current).toBe(true);
  });
});
