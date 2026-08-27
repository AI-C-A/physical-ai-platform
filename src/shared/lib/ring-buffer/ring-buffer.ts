/** 고주기 표본을 정해진 개수만 유지해 브라우저 메모리 증가를 제한한다. */
export class RingBuffer<TValue> {
  readonly #capacity: number;
  readonly #values: Array<TValue | undefined>;
  #size = 0;
  #writeIndex = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('RingBuffer capacity는 1 이상의 정수여야 합니다.');
    }

    this.#capacity = capacity;
    this.#values = Array.from({ length: capacity });
  }

  get capacity(): number {
    return this.#capacity;
  }

  get size(): number {
    return this.#size;
  }

  push(value: TValue): void {
    this.#values[this.#writeIndex] = value;
    this.#writeIndex = (this.#writeIndex + 1) % this.#capacity;
    this.#size = Math.min(this.#size + 1, this.#capacity);
  }

  clear(): void {
    this.#values.fill(undefined);
    this.#size = 0;
    this.#writeIndex = 0;
  }

  toArray(): readonly TValue[] {
    const startIndex =
      this.#size === this.#capacity ? this.#writeIndex : 0;
    const result: TValue[] = [];

    for (let offset = 0; offset < this.#size; offset += 1) {
      const index = (startIndex + offset) % this.#capacity;
      const value = this.#values[index];

      if (value !== undefined) {
        result.push(value);
      }
    }

    return result;
  }
}
