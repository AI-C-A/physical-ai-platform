import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAnalyticsPort } from '@/entities/analytics';
import {
  getCaptureSessionStatusLabel,
  type CaptureSessionStatus,
} from '@/entities/capture-session';
import { useRobotCatalog } from '@/entities/robot';
import { useAsyncQuery } from '@/shared/lib/async-query';
import { useClock } from '@/shared/lib/clock';
import { formatBytes } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Chart } from '@/shared/ui/chart';
import { ErrorMessage } from '@/shared/ui/error-message';
import { PageHeader } from '@/shared/ui/page-header';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Select } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

const allRobotsOptionValue = 'filter:all';

function getRobotOptionValue(robotId: string): string {
  return `robot:${robotId}`;
}

function readRobotOptionValue(value: string): string | null {
  return value === allRobotsOptionValue ? null : value.slice('robot:'.length);
}

function getStatusLabel(value: string): string {
  const known: CaptureSessionStatus | null = value === 'completed'
    || value === 'failed'
    || value === 'interrupted'
    || value === 'recording'
    || value === 'draft'
    || value === 'validating'
    || value === 'ready'
    || value === 'starting'
    || value === 'stopping'
    || value === 'finalizing'
    || value === 'processing'
    ? value
    : null;
  return known === null
    ? `미분류 상태 (${value.length === 0 ? '빈 값' : value})`
    : getCaptureSessionStatusLabel(known);
}

export function BigDataOverviewPage() {
  const analytics = useAnalyticsPort();
  const robots = useRobotCatalog();
  const clock = useClock();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedRobotId = params.get('robot');
  const hasExplicitRobotFilter = requestedRobotId !== null;
  const robotId = requestedRobotId;
  const hasInvalidRobotFilter = robots.status === 'ready'
    && hasExplicitRobotFilter
    && !robots.robots.some((robot) => robot.id === requestedRobotId);
  const requestedRange = params.get('range') ?? '7';
  const range = requestedRange === '1' || requestedRange === '30'
    ? requestedRange
    : '7';
  const canLoadOverview = !hasExplicitRobotFilter
    || (robots.status === 'ready' && !hasInvalidRobotFilter);
  const load = useCallback(
    () => {
      if (!canLoadOverview) {
        return Promise.reject(new Error('로봇 필터를 확인할 때까지 운영 집계 조회를 보류합니다.'));
      }
      const endMs = clock.nowMs();
      return analytics.getOverview({
        startMs: endMs - Number(range) * 86_400_000,
        endMs,
        robotId,
      });
    },
    [analytics, canLoadOverview, clock, range, robotId],
  );
  const subscribe = useCallback(
    (listener: () => void) => analytics.subscribe(listener),
    [analytics],
  );
  const overview = useAsyncQuery(
    load,
    canLoadOverview ? subscribe : undefined,
    { retainPreviousData: true },
  );

  function update(key: string, value: string): void {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }

  function updateRobot(value: string): void {
    const next = new URLSearchParams(params);
    const selectedRobotId = readRobotOptionValue(value);
    if (selectedRobotId === null) {
      next.delete('robot');
    } else {
      next.set('robot', selectedRobotId);
    }
    setParams(next);
  }

  if (
    overview.status === 'loading'
    || (hasExplicitRobotFilter && robots.status === 'loading')
  ) {
    return <QueryFeedback kind="loading" />;
  }
  if (hasExplicitRobotFilter && robots.status === 'error') {
    return <QueryFeedback kind="error" message={robots.message} onRetry={robots.retry} />;
  }
  if (hasInvalidRobotFilter) {
    return (
      <div className="grid gap-6">
        <PageHeader title="개요" />
        <Panel title="로봇 필터를 적용하지 않았습니다">
          <ErrorMessage>등록 목록에 없는 로봇 ID입니다: {requestedRobotId}</ErrorMessage>
          <Button className="mt-4" onClick={() => updateRobot(allRobotsOptionValue)} variant="secondary">
            전체 로봇 보기
          </Button>
        </Panel>
      </div>
    );
  }
  if (overview.status === 'error') {
    return <QueryFeedback kind="error" message={overview.message} onRetry={overview.retry} />;
  }

  const data = overview.data;
  const statusChartData = data.statusSeries.map((item) => ({
    id: item.label,
    label: getStatusLabel(item.label),
    value: item.value,
  }));
  const rangeLabel = range === '1' ? '24시간' : `${range}일`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="개요"
      />
      {!hasExplicitRobotFilter && robots.status === 'error' ? (
        <Panel title="로봇 목록을 불러오지 못했습니다">
          <ErrorMessage>
            전체 로봇 기준 운영 집계는 유지했습니다. 개별 로봇 필터를 사용할 수 없습니다. {robots.message}
          </ErrorMessage>
          <Button className="mt-4" onClick={robots.retry} variant="secondary">
            로봇 목록 다시 불러오기
          </Button>
        </Panel>
      ) : null}
      {overview.refreshError === null ? null : (
        <Panel title="최신 운영 집계를 반영하지 못했습니다">
          <ErrorMessage>기존 결과를 유지했습니다. {overview.refreshError}</ErrorMessage>
          <Button className="mt-4" onClick={overview.retry} variant="secondary">다시 불러오기</Button>
        </Panel>
      )}
      <Panel
        title="집계 조건"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            disabled={robots.status !== 'ready'}
            label="로봇"
            onValueChange={updateRobot}
            options={[
              { label: '전체', value: allRobotsOptionValue },
              ...robots.robots.map((robot) => ({
                label: robot.displayName,
                value: getRobotOptionValue(robot.id),
              })),
            ]}
            value={robotId === null ? allRobotsOptionValue : getRobotOptionValue(robotId)}
          />
          <Select
            label="기간"
            onValueChange={(value) => update('range', value)}
            options={[
              { label: '24시간', value: '1' },
              { label: '7일', value: '7' },
              { label: '30일', value: '30' },
            ]}
            value={range}
          />
        </div>
        {!hasExplicitRobotFilter && robots.status === 'loading' ? (
          <Spinner className="mt-3" label="로봇 목록 불러오는 중" />
        ) : null}
      </Panel>

      {overview.isRefreshing ? (
        <QueryFeedback kind="loading" />
      ) : null}
      <section aria-label="수집 운영 지표" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Panel><p className="text-sm text-neutral-600">수집 세션</p><strong className="mt-2 block text-2xl">{String(data.sessionCount)}</strong></Panel>
        <Panel>
          <p className="text-sm text-neutral-600">완료율</p>
          <strong className="mt-2 block text-2xl">
            {data.successRatePercent === null ? '—' : `${data.successRatePercent.toFixed(1)}%`}
          </strong>
        </Panel>
        <Panel><p className="text-sm text-neutral-600">기록량</p><strong className="mt-2 block text-2xl">{formatBytes(data.bytesWritten)}</strong></Panel>
        <Panel><p className="text-sm text-neutral-600">에피소드</p><strong className="mt-2 block text-2xl">{String(data.episodeCount)}</strong></Panel>
        <Panel><p className="text-sm text-neutral-600">연결 데이터셋</p><strong className="mt-2 block text-2xl">{String(data.datasetCount)}</strong></Panel>
      </section>

      {data.sessionCount === 0 ? (
        overview.isRefreshing ? null : (
          <QueryFeedback
            kind="empty"
            message="선택한 로봇과 기간에 수집 세션이 없어 완료율·상태 분포·추이를 계산할 수 없습니다."
          />
        )
      ) : (
        <section className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="수집 세션 상태 분포"
          >
            <Chart
              accessibleSummary={(
                <p>{statusChartData.map((item) => `${item.label} ${String(item.value)}건`).join(', ')}</p>
              )}
              data={statusChartData}
              isPending={overview.isRefreshing}
              kind="bar"
              onDatumSelect={(datum) => {
                if (datum.id !== undefined) {
                  const next = new URLSearchParams({
                    mode: 'operations',
                    type: 'session',
                    status: datum.id,
                  });
                  if (robotId !== null) next.set('robot', robotId);
                  next.set('range', range);
                  void navigate(`/bigdata/explorer?${next.toString()}`);
                }
              }}
            />
          </Panel>
          <Panel title={`최근 ${rangeLabel} 수집 세션 추이`}>
            <Chart
              accessibleSummary={(
                <p>{data.trendSeries.map((item) => `${item.label} ${String(item.value)}건`).join(', ')}</p>
              )}
              data={data.trendSeries}
              isPending={overview.isRefreshing}
            />
          </Panel>
        </section>
      )}
    </div>
  );
}
