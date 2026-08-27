export interface ClockPort {
  /** 현재 시각을 Unix epoch millisecond로 반환한다. */
  nowMs(): number;
}

export const systemClock: ClockPort = {
  nowMs: () => Date.now(),
};
