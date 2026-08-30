import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useRobotCatalog } from '@/entities/robot';
import {
  useRobotEventRepository,
  type RobotEvent,
  type RobotEventQuery,
  type RobotEventType,
} from '@/entities/robot-event';
import {
  readAllowedValue,
  readPositivePage,
} from '@/shared/lib/collection-query';
import { useAsyncQuery } from '@/shared/lib/async-query';
import { useClock } from '@/shared/lib/clock';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataView } from '@/shared/ui/data-view';
import { Dialog } from '@/shared/ui/dialog';
import { ErrorMessage } from '@/shared/ui/error-message';
import { PageHeader } from '@/shared/ui/page-header';
import { PageToolbar } from '@/shared/ui/page-toolbar';
import { Pagination } from '@/shared/ui/pagination';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Select } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

const pageSize = 20;
const eventTypes = ['info', 'warning', 'error'] as const satisfies readonly RobotEventType[];
const eventTypeValues = ['all', ...eventTypes] as const;
const rangeValues = ['1', '7', '30', 'all'] as const;
const allRobotsSelectValue = 'all-robots';
const robotSelectValuePrefix = 'robot:';

function getRobotSelectValue(robotId: string): string {
  return `${robotSelectValuePrefix}${JSON.stringify(robotId)}`;
}

const eventTypeMeta = {
  info: { label: '정보', tone: 'info' },
  warning: { label: '경고', tone: 'warning' },
  error: { label: '오류', tone: 'negative' },
} as const satisfies Record<
  RobotEventType,
  { readonly label: string; readonly tone: 'info' | 'warning' | 'negative' }
>;

export function EventsPage() {
  const catalog = useRobotCatalog();
  const repository = useRobotEventRepository();
  const clock = useClock();
  const [params, setParams] = useSearchParams();
  const [selectedEvent, setSelectedEvent] = useState<RobotEvent | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const resultsRegionRef = useRef<HTMLElement>(null);
  const eventType = readAllowedValue(
    params.get('type'),
    eventTypeValues,
    'all',
  );
  const requestedRobotId = params.get('robotId');
  const hasExplicitRobotFilter = requestedRobotId !== null;
  const hasInvalidRobotFilter = catalog.status === 'ready'
    && hasExplicitRobotFilter
    && !catalog.robots.some((robot) => robot.id === requestedRobotId);
  const range = readAllowedValue(params.get('range'), rangeValues, '7');
  const requestedPage = readPositivePage(params.get('page'));
  const rangeAnchorKey = useMemo(
    () => JSON.stringify([eventType, requestedRobotId, range]),
    [eventType, range, requestedRobotId],
  );
  const rangeAnchorRef = useRef<{ readonly key: string; readonly endMs: number } | null>(null);
  const getRangeAnchorMs = useCallback(() => {
    if (rangeAnchorRef.current?.key !== rangeAnchorKey) {
      rangeAnchorRef.current = { key: rangeAnchorKey, endMs: clock.nowMs() };
    }
    return rangeAnchorRef.current.endMs;
  }, [clock, rangeAnchorKey]);
  const resetRangeAnchor = useCallback(() => {
    rangeAnchorRef.current = { key: rangeAnchorKey, endMs: clock.nowMs() };
  }, [clock, rangeAnchorKey]);
  const queryTemplate = useMemo<RobotEventQuery>(() => ({
    type: eventType === 'all' ? null : eventType,
    robotId: requestedRobotId,
    startMs: null,
    page: requestedPage,
    pageSize,
  }), [eventType, requestedPage, requestedRobotId]);
  const canQueryEvents = !hasExplicitRobotFilter
    || (catalog.status === 'ready' && !hasInvalidRobotFilter);
  const loadEvents = useCallback(() => {
    if (!canQueryEvents) {
      return Promise.reject(new Error('로봇 필터를 확인할 때까지 이벤트 조회를 보류합니다.'));
    }
    return repository.queryEvents({
      ...queryTemplate,
      startMs: range === 'all'
        ? null
        : getRangeAnchorMs() - Number(range) * 86_400_000,
    });
  }, [canQueryEvents, getRangeAnchorMs, queryTemplate, range, repository]);
  const subscribeEvents = useCallback(
    (listener: () => void) => repository.subscribe(() => {
      resetRangeAnchor();
      listener();
    }),
    [repository, resetRangeAnchor],
  );
  const events = useAsyncQuery(
    loadEvents,
    canQueryEvents ? subscribeEvents : undefined,
    { retainPreviousData: true },
  );

  function retryEvents(): void {
    resetRangeAnchor();
    events.retry();
  }

  function updateParam(key: string, value: string): void {
    const next = new URLSearchParams(params);
    if (value === '' || (value === 'all' && key === 'type')) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  function updateRobotFilter(value: string): void {
    if (value === allRobotsSelectValue) {
      updateParam('robotId', '');
      return;
    }
    const selectedRobot = catalog.robots.find(
      (robot) => getRobotSelectValue(robot.id) === value,
    );
    if (selectedRobot !== undefined) updateParam('robotId', selectedRobot.id);
  }

  function restoreDialogFocus(event: Event): void {
    event.preventDefault();
    const trigger = dialogTriggerRef.current;
    if (trigger?.isConnected === true) {
      trigger.focus();
      return;
    }
    resultsRegionRef.current?.focus();
  }

  if (
    events.status === 'loading'
    || (hasExplicitRobotFilter && catalog.status === 'loading')
  ) {
    return <QueryFeedback kind="loading" />;
  }
  if (hasExplicitRobotFilter && catalog.status === 'error') {
    return <QueryFeedback kind="error" message={catalog.message} onRetry={catalog.retry} />;
  }
  if (hasInvalidRobotFilter) {
    return (
      <div className="grid gap-6">
        <PageHeader title="이벤트 로그" />
        <Panel title="로봇 필터를 적용하지 않았습니다">
          <ErrorMessage>등록 목록에 없는 로봇 ID입니다: {requestedRobotId}</ErrorMessage>
          <Button className="mt-4" onClick={() => updateParam('robotId', '')} variant="secondary">
            전체 로봇 보기
          </Button>
        </Panel>
      </div>
    );
  }
  if (events.status === 'error') {
    return <QueryFeedback kind="error" message={events.message} onRetry={retryEvents} />;
  }

  const robotNames = new Map(
    catalog.robots.map((robot) => [robot.id, robot.displayName]),
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="이벤트 로그"
      />
      {catalog.status === 'error' ? (
        <Panel title="로봇 필터를 불러오지 못했습니다">
          <ErrorMessage>
            이벤트 결과는 유지했지만 로봇 이름과 필터를 사용할 수 없습니다. {catalog.message}
          </ErrorMessage>
          <Button className="mt-4" onClick={catalog.retry} variant="secondary">
            로봇 목록 다시 불러오기
          </Button>
        </Panel>
      ) : catalog.status === 'loading' ? (
        <Spinner label="로봇 필터 불러오는 중" />
      ) : null}
      {events.refreshError === null ? null : (
        <Panel title="최신 이벤트를 반영하지 못했습니다">
          <ErrorMessage>기존 결과를 유지했습니다. {events.refreshError}</ErrorMessage>
          <Button className="mt-4" onClick={retryEvents} variant="secondary">다시 불러오기</Button>
        </Panel>
      )}
      <PageToolbar aria-label="이벤트 필터">
          <Select
            label="유형"
            onValueChange={(value) => updateParam('type', value)}
            options={[
              { label: '전체', value: 'all' },
              ...eventTypes.map((value) => ({
                label: eventTypeMeta[value].label,
                value,
              })),
            ]}
            value={eventType}
          />
          <Select
            disabled={catalog.status !== 'ready'}
            label="로봇"
            onValueChange={updateRobotFilter}
            options={[
              { label: '전체', value: allRobotsSelectValue },
              ...catalog.robots.map((robot) => ({
                label: robot.displayName,
                value: getRobotSelectValue(robot.id),
              })),
            ]}
            value={requestedRobotId === null
              ? allRobotsSelectValue
              : getRobotSelectValue(requestedRobotId)}
          />
          <Select
            label="기간"
            onValueChange={(value) => updateParam('range', value)}
            options={[
              { label: '24시간', value: '1' },
              { label: '7일', value: '7' },
              { label: '30일', value: '30' },
              { label: '전체', value: 'all' },
            ]}
            value={range}
          />
      </PageToolbar>
      <section
        aria-label="이벤트 결과 영역"
        className="grid gap-6 rounded-[var(--design-radius-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        ref={resultsRegionRef}
        tabIndex={-1}
      >
        <DataView
          footer={events.data.items.length === 0 ? undefined : (
            <Pagination
              isPending={events.isRefreshing}
              onPageChange={(value) => updateParam('page', String(value))}
              page={events.data.page}
              pageSize={events.data.pageSize}
              totalItems={events.data.totalItems}
            />
          )}
          message="조건에 맞는 이벤트가 없습니다."
          state={events.data.items.length === 0 && !events.isRefreshing ? 'empty' : 'ready'}
        >
          {events.isRefreshing ? <QueryFeedback kind="loading" /> : null}
          {events.data.items.length === 0 ? null : (
            <Table aria-label="로봇 이벤트 목록">
            <TableHeader>
              <TableRow>
                <TableHead>시각</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>로봇</TableHead>
                <TableHead>내용</TableHead>
                <TableHead>상세</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.data.items.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{formatDateTime(event.occurredAtMs)}</TableCell>
                  <TableCell>
                    <Badge tone={eventTypeMeta[event.type].tone}>
                      {eventTypeMeta[event.type].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {robotNames.get(event.robotId) ?? event.robotId}
                    <span className="block text-xs text-muted">
                      {event.robotId}
                    </span>
                  </TableCell>
                  <TableCell><strong>{event.title}</strong></TableCell>
                  <TableCell>
                    <Button
                      aria-label={`${event.title} 상세 보기 (${event.id})`}
                      onClick={(clickEvent) => {
                        dialogTriggerRef.current = clickEvent.currentTarget;
                        setSelectedEvent(event);
                      }}
                      variant="ghost"
                    >
                      보기
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          )}
        </DataView>
      </section>
      {selectedEvent === null ? null : (
        <Dialog
          onCloseAutoFocus={restoreDialogFocus}
          onOpenChange={(open) => {
            if (!open) setSelectedEvent(null);
          }}
          open
          title={selectedEvent.title}
        >
          <dl className="grid gap-3">
            <div>
              <dt className="text-xs text-muted">로봇</dt>
              <dd>{robotNames.get(selectedEvent.robotId) ?? selectedEvent.robotId}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">발생 시각</dt>
              <dd>{formatDateTime(selectedEvent.occurredAtMs)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">내용</dt>
              <dd>{selectedEvent.detail}</dd>
            </div>
          </dl>
        </Dialog>
      )}
    </div>
  );
}
