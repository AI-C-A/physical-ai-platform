import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  type InterventionRequest,
  useActiveInterventionRequests,
  useInterventionQueue,
} from '@/entities/intervention';
import { useClock } from '@/shared/lib/clock';
import { formatDateTime } from '@/shared/lib/format';
import { appendPathSegment } from '@/shared/lib/navigation';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Surface } from '@/shared/ui/surface';
import { useToast } from '@/shared/ui/toast';

const secondsFormatter = new Intl.NumberFormat('ko-KR');

function formatElapsedSeconds(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  return `${secondsFormatter.format(seconds)}초 전`;
}


function getMonitoringTarget(request: InterventionRequest) {
  return {
    pathname: appendPathSegment('/control/monitoring', request.robotId),
    search: `?${new URLSearchParams({
      siteId: request.siteId,
      interventionId: request.id,
    }).toString()}`,
  };
}

function InterventionCameraPreview({
  request,
}: {
  readonly request: InterventionRequest;
}) {
  return (
    <div className="overflow-hidden bg-layer-canvas">
      <img
        alt={request.snapshot.alt}
        className="block h-auto w-full object-contain"
        decoding="async"
        height={request.snapshot.height}
        loading="lazy"
        src={request.snapshot.url}
        width={request.snapshot.width}
      />
    </div>
  );
}

function InterventionRequestCard({
  accepting,
  nowMs,
  onAccept,
  request,
}: {
  readonly accepting: boolean;
  readonly nowMs: number;
  readonly onAccept: (request: InterventionRequest) => void;
  readonly request: InterventionRequest;
}) {
  const monitoringTarget = getMonitoringTarget(request);
  const elapsedLabel = formatElapsedSeconds(nowMs - request.requestedAtMs);
  const locationLabel = [request.siteName, request.location].join(' · ');

  return (
    <Surface
      aria-labelledby={`${request.id}-title`}
      as="article"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden p-0"
    >
      <InterventionCameraPreview request={request} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 text-sm">
          <p className="font-semibold text-foreground">{request.robotName}</p>
          <time
            className="shrink-0 text-muted"
            dateTime={new Date(request.requestedAtMs).toISOString()}
          >
            {elapsedLabel}
          </time>
        </div>
        <h2
          className="mt-4 text-xl font-bold leading-7 text-foreground"
          id={`${request.id}-title`}
        >
          {request.operatorPrompt}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {request.situationSummary}
        </p>

        <div className="mt-5 text-sm leading-5 text-muted">
          <p>{locationLabel}</p>
          <p className="mt-1">
            이슈 발생{' '}
            <time dateTime={new Date(request.issueOccurredAtMs).toISOString()}>
              {formatDateTime(request.issueOccurredAtMs)}
            </time>
          </p>
        </div>

        <div className="mt-auto pt-6">
          {request.status === 'waiting' ? (
            <Button
              aria-label={`${request.robotName} 요청을 수락하고 관제 시작`}
              className="min-h-12 w-full"
              isLoading={accepting}
              onClick={() => onAccept(request)}
            >
              수락하고 관제 시작
            </Button>
          ) : (
            <Link
              aria-label={`${request.robotName} 처리 중인 관제 열기`}
              className={getButtonClassName(
                'primary',
                'min-h-12 w-full',
              )}
              to={monitoringTarget}
            >
              처리 중인 관제 열기
            </Link>
          )}
        </div>
      </div>
    </Surface>
  );
}

export function InterventionsPage() {
  const clock = useClock();
  const navigate = useNavigate();
  const queue = useInterventionQueue();
  const requests = useActiveInterventionRequests();
  const { showToast } = useToast();
  const [nowMs, setNowMs] = useState(() => clock.nowMs());
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(clock.nowMs()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [clock]);

  const handleAccept = async (request: InterventionRequest): Promise<void> => {
    setAcceptingRequestId(request.id);
    try {
      await queue.accept(request.id);
      void navigate(getMonitoringTarget(request));
    } catch {
      showToast(
        '개입 요청을 수락하지 못했습니다. 다시 시도해 주세요.',
        'error',
      );
      setAcceptingRequestId(null);
    }
  };

  if (requests.status === 'loading') {
    return <QueryFeedback kind="loading" />;
  }
  if (requests.status === 'error') {
    return (
      <QueryFeedback
        kind="error"
        message="개입 요청을 불러오지 못했습니다."
        onRetry={requests.retry}
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader title="개입 요청" />
      {requests.data.length === 0 ? (
        <QueryFeedback kind="empty" message="활성 개입 요청이 없습니다." />
      ) : (
        <section
          aria-label="개입 요청 목록"
          className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3"
        >
          {requests.data.map((request) => (
            <InterventionRequestCard
              accepting={acceptingRequestId === request.id}
              key={request.id}
              nowMs={nowMs}
              onAccept={(selectedRequest) => void handleAccept(selectedRequest)}
              request={request}
            />
          ))}
        </section>
      )}
    </div>
  );
}
