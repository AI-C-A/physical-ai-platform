import { Link, useLocation, useParams } from 'react-router-dom';

import { useRobot, type RobotDescriptor } from '@/entities/robot';
import { RobotCameraGrid } from '@/entities/robot-video';
import { decodePathSegment } from '@/shared/lib/navigation';
import { Icon } from '@/shared/ui/icon';
import { QueryFeedback } from '@/shared/ui/query-feedback';

function RobotMonitoringContent({
  returnPath,
  robot,
}: {
  readonly returnPath: string;
  readonly robot: RobotDescriptor;
}) {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-neutral-100">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-300 bg-white px-3 sm:px-4">
        <Link
          aria-label="모니터링으로 돌아가기"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          to={returnPath}
        >
          <Icon name="back" />
        </Link>
        <div className="min-w-0 border-l border-neutral-300 pl-3 sm:pl-4">
          <h1 className="truncate text-base font-bold text-neutral-950 sm:text-lg">
            {robot.displayName}
          </h1>
          <p className="hidden truncate text-xs text-neutral-500 sm:block">{robot.id}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-neutral-900 p-2 sm:p-3">
        <RobotCameraGrid
          presentation="monitoring"
          robotId={robot.id}
        />
      </div>
    </div>
  );
}

export function RobotMonitoringPage() {
  const { robotId: encodedRobotId = '' } = useParams();
  const location = useLocation();
  const robotId = decodePathSegment(encodedRobotId);
  const robot = useRobot(robotId);
  const returnPath = `/control/monitoring${location.search}`;

  if (robot.status === 'loading') {
    return (
      <div className="min-h-dvh bg-neutral-100 p-4 sm:p-6">
        <QueryFeedback kind="loading" />
      </div>
    );
  }
  if (robot.status === 'error') {
    return (
      <div className="min-h-dvh bg-neutral-100 p-4 sm:p-6">
        <QueryFeedback kind="error" message={robot.message} onRetry={robot.retry} />
      </div>
    );
  }
  if (robot.data === null) {
    return (
      <div className="grid min-h-dvh content-start gap-4 bg-neutral-100 p-4 sm:p-6">
        <QueryFeedback kind="not-found" message="관제할 로봇을 찾을 수 없습니다." />
        <Link
          aria-label="모니터링으로 돌아가기"
          className="inline-flex size-10 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          to={returnPath}
        >
          <Icon name="back" />
        </Link>
      </div>
    );
  }

  return <RobotMonitoringContent returnPath={returnPath} robot={robot.data} />;
}
