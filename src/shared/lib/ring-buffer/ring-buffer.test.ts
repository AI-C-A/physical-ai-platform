import { describe, expect, it } from 'vitest';

import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('capacity를 넘으면 가장 오래된 값을 제거한다', () => {
    const buffer = new RingBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4);

    expect(buffer.toArray()).toEqual([2, 3, 4]);
    expect(buffer.size).toBe(3);
  });

  it('clear 후 같은 capacity로 다시 사용할 수 있다', () => {
    const buffer = new RingBuffer<string>(2);

    buffer.push('first');
    buffer.clear();
    buffer.push('second');

    expect(buffer.capacity).toBe(2);
    expect(buffer.toArray()).toEqual(['second']);
  });

  it('잘못된 capacity를 거부한다', () => {
    expect(() => new RingBuffer(0)).toThrow(
      'RingBuffer capacity는 1 이상의 정수여야 합니다.',
    );
  });
});
