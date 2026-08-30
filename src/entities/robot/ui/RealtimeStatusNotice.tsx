import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import type { RobotOperationalStatusStreamIssue } from '../model/robot-operational-status';

interface RealtimeStatusNoticeProps {
  readonly fallbackLastSuccessfulAtMs?: number | null;
  readonly issue: RobotOperationalStatusStreamIssue;
  readonly onRetry: () => void;
}

export function RealtimeStatusNotice({
  fallbackLastSuccessfulAtMs = null,
  issue,
  onRetry,
}: RealtimeStatusNoticeProps) {
  const isGatewayIssue = issue.reason === 'gateway-unreachable';
  const title = isGatewayIssue ? '실시간 연결 끊김' : '최신 상태 확인 불가';
  const description = '최신 로봇 상태를 확인할 수 없습니다.';
  const lastSuccessfulAtMs = issue.lastSuccessfulAtMs ?? fallbackLastSuccessfulAtMs;

  return (
    <section
      aria-label={title}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-warning-foreground/30 bg-status-warning-background p-3"
    >
      <div className="grid min-w-0 gap-1">
        <span>
          <Badge tone={isGatewayIssue ? 'negative' : 'warning'}>{title}</Badge>
        </span>
        <p className="text-sm text-foreground">
          {description}
          {lastSuccessfulAtMs === null
            ? null
            : ` 마지막 수신은 ${formatDateTime(lastSuccessfulAtMs)}입니다.`}
        </p>
      </div>
      <Button onClick={onRetry} variant="secondary">
        {isGatewayIssue ? '연결 다시 확인' : '상태 다시 확인'}
      </Button>
    </section>
  );
}
