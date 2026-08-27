import { describe, expect, it } from 'vitest';

import {
  appendPathSegment,
  decodePathSegment,
  encodePathSegment,
} from './navigation';

describe('appendPathSegment', () => {
  it('외부 식별자의 예약 문자를 단일 경로 세그먼트로 인코딩한다', () => {
    expect(appendPathSegment('/mlops/sessions/', 'site/a?mode=x&next=#top')).toBe(
      '/mlops/sessions/site%2Fa%3Fmode%3Dx%26next%3D%23top',
    );
  });

  it.each([
    ['.', '~id~2e'],
    ['..', '~id~2e2e'],
  ])('점 세그먼트 %s가 브라우저에서 상위 경로로 정규화되지 않게 한다', (id, encoded) => {
    const path = appendPathSegment('/mlops/sessions', id);

    expect(path).toBe(`/mlops/sessions/${encoded}`);
    expect(new URL(path, 'https://example.test').pathname).toBe(path);
  });

  it('일반 식별자는 읽을 수 있는 URL을 유지한다', () => {
    expect(appendPathSegment('/control/robots', 'robot-001')).toBe(
      '/control/robots/robot-001',
    );
  });
});

describe('동적 경로 식별자 코덱', () => {
  it.each([
    '.',
    '..',
    'site/a?mode=x#top',
    '로봇-가/🤖',
    '~id~marker',
    '%2F',
    '',
  ])('%s 값을 손실 없이 왕복한다', (id) => {
    const routeParameter = decodeURIComponent(encodePathSegment(id));

    expect(decodePathSegment(routeParameter)).toBe(id);
  });

  it('코덱 표식으로 시작하는 식별자를 다시 이스케이프한다', () => {
    const encoded = encodePathSegment('~id~2e');

    expect(encoded).not.toBe('~id~2e');
    expect(decodePathSegment(encoded)).toBe('~id~2e');
  });

  it('유효하지 않은 코덱 표식은 외부 식별자 그대로 유지한다', () => {
    expect(decodePathSegment('~id~not-hex')).toBe('~id~not-hex');
    expect(decodePathSegment('~id~f')).toBe('~id~f');
  });
});
