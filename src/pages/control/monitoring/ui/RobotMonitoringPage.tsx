import { Link, useLocation, useParams } from 'react-router-dom';

import { useRobot, type RobotDescriptor } from '@/entities/robot';
import { RobotCameraGrid } from '@/entities/robot-video';
import { decodePathSegment } from '@/shared/lib/navigation';
import { getButtonClassName } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Icon } from '@/shared/ui/icon';
import { QueryFeedback } from '@/shared/ui/query-feedback';

function MonitoringExitLink({ returnPath }: { readonly returnPath: string }) {
  return (
    <Link
      aria-label="영상 관제 나가기"
      className={getButtonClassName('danger', 'shrink-0 border-0')}
      to={returnPath}
    >
      <Icon name="close" size="md" />
      <span>나가기</span>
    </Link>
  );
}

function RobotMonitoringContent({
  returnPath,
  robot,
}: {
  readonly returnPath: string;
  readonly robot: RobotDescriptor;
}) {
  return (
    <ColorSchemeArea
      className="flex h-dvh min-h-0 flex-col overflow-hidden"
      layer="raised"
      scheme="dark"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 px-3 text-foreground sm:px-4">
        <h1 className="truncate text-base font-bold text-foreground sm:text-lg">
          {robot.displayName}
        </h1>
        <MonitoringExitLink returnPath={returnPath} />
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-2 pt-0 sm:p-3 sm:pt-0">
        <RobotCameraGrid
          presentation="monitoring"
          robotId={robot.id}
        />
      </div>
    </ColorSchemeArea>
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
      <ColorSchemeArea className="min-h-dvh p-4 sm:p-6" layer="canvas">
        <QueryFeedback kind="loading" />
      </ColorSchemeArea>
    );
  }
  if (robot.status === 'error') {
    return (
      <ColorSchemeArea className="min-h-dvh p-4 sm:p-6" layer="canvas">
        <QueryFeedback kind="error" message={robot.message} onRetry={robot.retry} />
      </ColorSchemeArea>
    );
  }
  if (robot.data === null) {
    return (
      <ColorSchemeArea
        className="grid min-h-dvh content-start gap-4 p-4 sm:p-6"
        layer="canvas"
      >
        <QueryFeedback kind="not-found" message="관제할 로봇을 찾을 수 없습니다." />
        <div className="justify-self-start">
          <MonitoringExitLink returnPath={returnPath} />
        </div>
      </ColorSchemeArea>
    );
  }

  return <RobotMonitoringContent returnPath={returnPath} robot={robot.data} />;
}
