export interface TimedHeapSample {
  readonly elapsedMs: number;
  readonly usedBytes: number;
}

export function calculateHeapTrendBytesPerMs(
  samples: readonly TimedHeapSample[],
): number {
  if (samples.length < 2) return 0;
  const meanElapsedMs = samples.reduce(
    (sum, sample) => sum + sample.elapsedMs,
    0,
  ) / samples.length;
  const meanUsedBytes = samples.reduce(
    (sum, sample) => sum + sample.usedBytes,
    0,
  ) / samples.length;
  const numerator = samples.reduce(
    (sum, sample) =>
      sum
      + (sample.elapsedMs - meanElapsedMs)
        * (sample.usedBytes - meanUsedBytes),
    0,
  );
  const denominator = samples.reduce(
    (sum, sample) => sum + (sample.elapsedMs - meanElapsedMs) ** 2,
    0,
  );
  return denominator === 0 ? 0 : numerator / denominator;
}
