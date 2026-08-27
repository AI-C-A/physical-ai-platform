import { describe, expect, it } from 'vitest';

import {
  getControlModeLabel,
  getDataOriginLabel,
  getDeliveryModeLabel,
  getExecutionEnvironmentLabel,
  getExecutionProvenanceLabel,
} from './execution-display';

describe('execution display', () => {
  it('내부 provenance 값을 사용자 문구로 표시한다', () => {
    expect(getExecutionEnvironmentLabel('physical')).toBe('실제 환경');
    expect(getDeliveryModeLabel('replay')).toBe('재생');
    expect(getControlModeLabel('teleop')).toBe('원격 조작');
    expect(getDataOriginLabel('captured')).toBe('수집 원본');
    expect(getExecutionProvenanceLabel({
      environment: 'simulation',
      deliveryMode: 'replay',
      controlMode: 'autonomous',
      dataOrigin: 'synthetic',
    })).toBe('시뮬레이션 · 재생 · 자율 · 합성');
  });
});
