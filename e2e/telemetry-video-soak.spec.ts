import { expect, test } from './playwright-test';

import {
  expectApplicationReady,
  observeBrowserIssues,
} from './browser-assertions';
import {
  calculateHeapTrendBytesPerMs,
  type TimedHeapSample,
} from './soak-metrics';

interface BrowserWithCapturedTracks extends Window {
  __capturedVideoTracks?: readonly MediaStreamTrack[];
  __integrationSoakObservation?: {
    domMutationBatchCount: number;
    domMutationRecordCount: number;
    longTaskDurationsMs: number[];
    longTaskObserver: PerformanceObserver | null;
    longTaskSupported: boolean;
    mutationObserver: MutationObserver;
  };
}

// 장시간 회귀에서 급격한 증가만 잡고 짧은 GC 변동은 허용하는 상한이다.
const retainedHeapGrowthBudgetBytes = 8 * 1024 * 1024;
const heapTrendBudgetBytesPerSecond = (2 * 1024 * 1024) / 3;
const minimumHeapSampleCount = 5;
const minimumSoakDurationMs = 12_000;
const domNodeGrowthBudget = 16;
const maxLongTaskDurationBudgetMs = 500;

function readSoakDurationMs(): number {
  const parsed = Number(process.env.E2E_SOAK_MS ?? '15_000');
  if (!Number.isFinite(parsed)) return 15_000;
  return Math.max(parsed, minimumSoakDurationMs);
}

test('Camera 화면의 heap·DOM·Long Task가 제한되고 이탈 시 track을 정리한다', async ({
  page,
}, testInfo) => {
  test.setTimeout(readSoakDurationMs() + 45_000);
  const issues = observeBrowserIssues(page);

  await page.goto('/control/monitoring/robot-001');
  await expectApplicationReady(page);
  const videos = page.locator('video');
  await expect(videos).toHaveCount(2);
  await expect
    .poll(() =>
      videos.evaluateAll((elements) =>
        elements.every(
          (element) =>
            element instanceof HTMLVideoElement &&
            element.srcObject instanceof MediaStream &&
            element.srcObject.getTracks().length > 0 &&
            element.srcObject.getTracks().every((track) => track.readyState === 'live'),
        ),
      ),
    )
    .toBe(true);
  const capturedTrackCount = await page.evaluate(() => {
    const browser = window as BrowserWithCapturedTracks;
    browser.__capturedVideoTracks = Array.from(
      document.querySelectorAll('video'),
    ).flatMap((element) =>
      element.srcObject instanceof MediaStream
        ? element.srcObject.getTracks()
        : [],
    );
    return browser.__capturedVideoTracks.length;
  });
  expect(capturedTrackCount).toBeGreaterThan(0);
  await expect(
    page.getByRole('region', { name: '카메라 영상', exact: true }),
  ).toBeVisible();

  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send('HeapProfiler.enable');
  await page.evaluate(() => {
    const browser = window as BrowserWithCapturedTracks;
    const longTaskDurationsMs: number[] = [];
    const longTaskSupported =
      PerformanceObserver.supportedEntryTypes.includes('longtask');
    const longTaskObserver = longTaskSupported
      ? new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            longTaskDurationsMs.push(entry.duration);
          });
        })
      : null;
    longTaskObserver?.observe({ type: 'longtask' });

    const mutationObserver = new MutationObserver((records) => {
      const current = (window as BrowserWithCapturedTracks)
        .__integrationSoakObservation;
      if (current === undefined) return;
      current.domMutationBatchCount += 1;
      current.domMutationRecordCount += records.length;
    });
    const observation = {
      domMutationBatchCount: 0,
      domMutationRecordCount: 0,
      longTaskDurationsMs,
      longTaskObserver,
      longTaskSupported,
      mutationObserver,
    };
    observation.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    browser.__integrationSoakObservation = observation;
  });
  await page.waitForTimeout(1_000);
  await cdpSession.send('HeapProfiler.collectGarbage');
  const warmupHeap = await cdpSession.send('Runtime.getHeapUsage');
  const soakStartedAtMs = Date.now();

  const domNodeCounts = [await page.locator('*').count()];
  const periodicHeapSamples: TimedHeapSample[] = [{
    elapsedMs: 0,
    usedBytes: warmupHeap.usedSize,
  }];
  let nextHeapSampleMs = Date.now() + 3_000;
  const sampleUntilMs = Date.now() + readSoakDurationMs();
  while (Date.now() < sampleUntilMs) {
    expect(await page.evaluate(() => {
      const tracks = (window as BrowserWithCapturedTracks).__capturedVideoTracks;
      return tracks !== undefined
        && tracks.length > 0
        && tracks.every((track) => track.readyState === 'live');
    })).toBe(true);
    await page.waitForTimeout(1_000);
    domNodeCounts.push(await page.locator('*').count());
    if (Date.now() >= nextHeapSampleMs) {
      await cdpSession.send('HeapProfiler.collectGarbage');
      periodicHeapSamples.push({
        elapsedMs: Date.now() - soakStartedAtMs,
        usedBytes: (await cdpSession.send('Runtime.getHeapUsage')).usedSize,
      });
      nextHeapSampleMs += 3_000;
    }
  }

  const observation = await page.evaluate(() => {
    const browser = window as BrowserWithCapturedTracks;
    const metrics = browser.__integrationSoakObservation;
    if (metrics === undefined) {
      throw new Error('Camera 화면 soak 계측이 초기화되지 않았습니다.');
    }
    metrics.longTaskObserver?.takeRecords().forEach((entry) => {
      metrics.longTaskDurationsMs.push(entry.duration);
    });
    metrics.longTaskObserver?.disconnect();
    metrics.mutationObserver.takeRecords().forEach(() => {
      metrics.domMutationRecordCount += 1;
    });
    metrics.mutationObserver.disconnect();
    return {
      domMutationBatchCount: metrics.domMutationBatchCount,
      domMutationRecordCount: metrics.domMutationRecordCount,
      longTaskDurationsMs: metrics.longTaskDurationsMs,
      longTaskSupported: metrics.longTaskSupported,
    };
  });
  await cdpSession.send('HeapProfiler.collectGarbage');
  const finalHeap = await cdpSession.send('Runtime.getHeapUsage');
  await cdpSession.detach();

  const retainedHeapGrowthBytes = finalHeap.usedSize - warmupHeap.usedSize;
  const finalHeapSample: TimedHeapSample = {
    elapsedMs: Date.now() - soakStartedAtMs,
    usedBytes: finalHeap.usedSize,
  };
  const steadyStateHeapSamples = periodicHeapSamples.slice(-4);
  const steadyStateHeapTrendBytesPerSecond = calculateHeapTrendBytesPerMs(
    steadyStateHeapSamples,
  ) * 1_000;
  const domNodeGrowth =
    Math.max(...domNodeCounts) - Math.min(...domNodeCounts);
  const maxLongTaskDurationMs = Math.max(
    0,
    ...observation.longTaskDurationsMs,
  );
  const soakMetrics = {
    domMutationBatchCount: observation.domMutationBatchCount,
    domMutationRecordCount: observation.domMutationRecordCount,
    domNodeGrowth,
    finalHeapUsedBytes: finalHeap.usedSize,
    finalHeapSample,
    initialHeapUsedBytes: warmupHeap.usedSize,
    longTaskCount: observation.longTaskDurationsMs.length,
    maxLongTaskDurationMs,
    retainedHeapGrowthBytes,
    periodicHeapSamples,
    steadyStateHeapSamples,
    steadyStateHeapTrendBytesPerSecond,
    soakDurationMs: readSoakDurationMs(),
  };
  await testInfo.attach('integration-soak-metrics', {
    body: Buffer.from(JSON.stringify(soakMetrics, null, 2)),
    contentType: 'application/json',
  });

  expect(observation.longTaskSupported).toBe(true);
  expect(periodicHeapSamples.length).toBeGreaterThanOrEqual(
    minimumHeapSampleCount,
  );
  expect(domNodeGrowth).toBeLessThanOrEqual(domNodeGrowthBudget);
  expect(retainedHeapGrowthBytes).toBeLessThanOrEqual(
    retainedHeapGrowthBudgetBytes,
  );
  expect(steadyStateHeapTrendBytesPerSecond).toBeLessThanOrEqual(
    heapTrendBudgetBytesPerSecond,
  );
  expect(maxLongTaskDurationMs).toBeLessThanOrEqual(
    maxLongTaskDurationBudgetMs,
  );

  await page.getByRole('link', { name: '영상 관제 나가기' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/control/monitoring');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const browser = window as BrowserWithCapturedTracks;
        return (
          browser.__capturedVideoTracks !== undefined
          && browser.__capturedVideoTracks.length > 0
          && browser.__capturedVideoTracks.every(
            (track) => track.readyState === 'ended',
          )
        );
      }),
    )
    .toBe(true);
  issues.assertNone();
});
