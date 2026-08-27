export type SchedulerTimer = ReturnType<typeof globalThis.setTimeout>;

/** 비동기 상태 전이의 시간과 타이머를 테스트에서 제어할 수 있게 하는 최소 interface다. */
export interface Scheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): SchedulerTimer;
  clearTimeout(timer: SchedulerTimer): void;
  setInterval(callback: () => void, intervalMs: number): SchedulerTimer;
  clearInterval(timer: SchedulerTimer): void;
}

export const systemScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
  setInterval: (callback, intervalMs) =>
    globalThis.setInterval(callback, intervalMs),
  clearInterval: (timer) => globalThis.clearInterval(timer),
};

export function waitFor(
  scheduler: Scheduler,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    scheduler.setTimeout(resolve, durationMs);
  });
}
