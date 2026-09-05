import type { HandPoseFrame } from '../model/hand-pose';

/** drop-oldest 정책으로 고주기 전송 대기열의 메모리를 제한한다. */
export class HandPoseFrameQueue {
  readonly #capacity: number;
  readonly #frames: HandPoseFrame[] = [];
  #droppedFrameCount = 0;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new Error('Hand Pose queue capacity는 1 이상의 정수여야 합니다.');
    }
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#frames.length;
  }

  get capacity(): number {
    return this.#capacity;
  }

  get droppedFrameCount(): number {
    return this.#droppedFrameCount;
  }

  enqueue(frame: HandPoseFrame): void {
    if (this.#frames.length === this.#capacity) {
      this.#frames.shift();
      this.#droppedFrameCount += 1;
    }
    this.#frames.push(frame);
  }

  take(maximumFrames: number): readonly HandPoseFrame[] {
    if (!Number.isSafeInteger(maximumFrames) || maximumFrames <= 0) {
      throw new Error('꺼낼 frame 수는 1 이상의 정수여야 합니다.');
    }
    return this.#frames.splice(0, maximumFrames);
  }

  restoreFront(frames: readonly HandPoseFrame[]): void {
    this.#frames.unshift(...frames);
    while (this.#frames.length > this.#capacity) {
      this.#frames.shift();
      this.#droppedFrameCount += 1;
    }
  }

  clear(): void {
    this.#frames.splice(0);
  }
}
