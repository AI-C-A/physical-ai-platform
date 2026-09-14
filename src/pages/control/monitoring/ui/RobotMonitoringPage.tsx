import { Brand } from '@/shared/ui/brand';
import { useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';

import {
  type InterventionRequest,
  useInterventionQueue,
  useInterventionRequest,
} from '@/entities/intervention';
import { useRobot, type RobotDescriptor } from '@/entities/robot';
import { RobotCameraGrid } from '@/entities/robot-video';
import { decodePathSegment } from '@/shared/lib/navigation';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Dialog } from '@/shared/ui/dialog';
import { Icon } from '@/shared/ui/icon';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { useToast } from '@/shared/ui/toast';

import {
  monitoringViewportContentClassName,
  monitoringViewportHeaderClassName,
} from './monitoring-viewport-layout';

interface MonitoringExitLinkProps {
  readonly returnPath: string;
}

function MonitoringExitLink({ returnPath }: MonitoringExitLinkProps) {
  return (
    <Link
      aria-label="영상 관제 나가기"
      className={getButtonClassName(
        'ghost',
        'shrink-0 text-negative hover:bg-status-negative-background hover:text-negative active:bg-status-negative-background',
      )}
      to={returnPath}
    >
      <Icon name="close" size="md" />
      <span>나가기</span>
    </Link>
  );
}

const interventionStatusLabels = {
  waiting: '응답 대기',
  accepted: '수락됨',
  teleop: '원격제어 중',
  resolved: '해결됨',
  transferred: '이관됨',
  'emergency-stop': '긴급정지',
} as const;

type InterventionAction =
  | 'accept'
  | 'teleop'
  | 'resolve'
  | 'transfer'
  | 'emergency-stop';

function InterventionActionBar({
  request,
  returnPath,
}: {
  readonly request: InterventionRequest;
  readonly returnPath: string;
}) {
  const navigate = useNavigate();
  const queue = useInterventionQueue();
  const { showToast } = useToast();
  const [pendingAction, setPendingAction] = useState<InterventionAction | null>(null);
  const [emergencyDialogOpen, setEmergencyDialogOpen] = useState(false);

  const runCommand = async (
    action: InterventionAction,
    command: () => Promise<InterventionRequest>,
    successMessage: string,
    terminal = false,
  ): Promise<boolean> => {
    setPendingAction(action);
    try {
      await command();
      showToast(successMessage);
      if (terminal) void navigate(returnPath, { replace: true });
      return true;
    } catch {
      showToast(
        '개입 명령을 실행하지 못했습니다. 다시 시도해 주세요.',
        'error',
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const isBusy = pendingAction !== null;
  const handleEmergencyStop = async (): Promise<void> => {
    const succeeded = await runCommand(
      'emergency-stop',
      () => queue.emergencyStop(request.id),
      '로봇을 긴급정지했습니다.',
    );
    if (succeeded) setEmergencyDialogOpen(false);
  };

  return (
    <section
      aria-label="개입 대응"
      className="mx-2 mb-2 shrink-0 rounded-[var(--design-radius-surface)] bg-layer-base p-3 text-foreground sm:mx-3 sm:mb-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-foreground sm:text-base">
            {request.operatorPrompt}
          </h2>
          <p className="mt-1 text-xs text-muted">
            현재 상태 · {interventionStatusLabels[request.status]}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {request.status === 'waiting' ? (
            <Button
              disabled={isBusy}
              isLoading={pendingAction === 'accept'}
              onClick={() => void runCommand(
                'accept',
                () => queue.accept(request.id),
                '개입 요청을 수락했습니다.',
              )}
            >
              수락
            </Button>
          ) : null}
          {request.status === 'accepted' ? (
            <Button
              disabled={isBusy}
              isLoading={pendingAction === 'teleop'}
              onClick={() => void runCommand(
                'teleop',
                () => queue.startTeleoperation(request.id),
                '원격제어를 시작했습니다.',
              )}
            >
              원격제어 시작
            </Button>
          ) : null}
          {request.status === 'accepted'
            || request.status === 'teleop'
            || request.status === 'emergency-stop' ? (
              <>
                <Button
                  disabled={isBusy}
                  isLoading={pendingAction === 'resolve'}
                  onClick={() => void runCommand(
                    'resolve',
                    () => queue.resolve(request.id),
                    '개입 요청을 해결했습니다.',
                    true,
                  )}
                  variant="secondary"
                >
                  해결
                </Button>
                <Button
                  disabled={isBusy}
                  isLoading={pendingAction === 'transfer'}
                  onClick={() => void runCommand(
                    'transfer',
                    () => queue.transfer(request.id),
                    '개입 요청을 이관했습니다.',
                    true,
                  )}
                  variant="secondary"
                >
                  이관
                </Button>
              </>
            ) : null}
          {request.status === 'accepted' || request.status === 'teleop' ? (
            <div className="border-l border-border pl-2">
              <Dialog
                description="즉시 로봇의 모든 동작을 중단합니다. 영상을 확인하고 정말 필요한 경우에만 실행하세요."
                onOpenChange={setEmergencyDialogOpen}
                open={emergencyDialogOpen}
                title="긴급정지를 실행하시겠습니까?"
                trigger={(
                  <Button disabled={isBusy} variant="danger">
                    긴급정지
                  </Button>
                )}
              >
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted">로봇</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {request.robotName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">위치</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {request.siteName} · {request.location}
                    </dd>
                  </div>
                </dl>
                <Button
                  className="mt-5 w-full"
                  isLoading={pendingAction === 'emergency-stop'}
                  onClick={() => void handleEmergencyStop()}
                  variant="danger"
                >
                  긴급정지 실행
                </Button>
              </Dialog>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function InterventionWarning({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div
      className="mx-2 mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[var(--design-radius-control)] bg-status-warning-background px-3 py-2 text-sm text-status-warning-foreground sm:mx-3 sm:mb-3"
      role="alert"
    >
      <span>{message}</span>
      {onRetry === undefined ? null : (
        <Button onClick={onRetry} variant="secondary">
          다시 시도
        </Button>
      )}
    </div>
  );
}

function RobotMonitoringContent({
  interventionId,
  returnPath,
  robot,
}: {
  readonly interventionId: string | null;
  readonly returnPath: string;
  readonly robot: RobotDescriptor;
}) {
  const intervention = useInterventionRequest(interventionId);
  let interventionFooter = null;

  if (interventionId !== null) {
    if (intervention.status === 'loading') {
      interventionFooter = (
        <p className="mx-3 mb-3 shrink-0 text-sm text-muted" role="status">
          개입 요청을 확인하고 있습니다.
        </p>
      );
    } else if (intervention.status === 'error') {
      interventionFooter = (
        <InterventionWarning
          message="개입 요청을 불러오지 못해 조작을 사용할 수 없습니다."
          onRetry={intervention.retry}
        />
      );
    } else if (intervention.data === null) {
      interventionFooter = (
        <InterventionWarning message="개입 요청을 찾을 수 없어 조작을 사용할 수 없습니다." />
      );
    } else if (intervention.data.robotId !== robot.id) {
      interventionFooter = (
        <InterventionWarning message="이 개입 요청은 현재 로봇과 일치하지 않아 조작을 사용할 수 없습니다." />
      );
    } else if (
      intervention.data.status === 'resolved'
      || intervention.data.status === 'transferred'
    ) {
      interventionFooter = <InterventionWarning message="이미 종료된 개입 요청입니다." />;
    } else {
      interventionFooter = (
        <InterventionActionBar request={intervention.data} returnPath={returnPath} />
      );
    }
  }

  return (
    <ColorSchemeArea
      className="flex h-dvh min-h-0 flex-col overflow-hidden"
      layer="raised"
      scheme="dark"
    >
      <header className={monitoringViewportHeaderClassName}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Brand compact linked={false} className="min-h-0" />
          <h1 className="truncate text-base font-bold text-foreground sm:text-lg">
            {robot.displayName}
          </h1>
        </div>
        <MonitoringExitLink returnPath={returnPath} />
      </header>
      <div className={monitoringViewportContentClassName}>
        <RobotCameraGrid
          presentation="monitoring"
          robotId={robot.id}
        />
      </div>
      {interventionFooter}
    </ColorSchemeArea>
  );
}

export function RobotMonitoringPage() {
  const { robotId: encodedRobotId = '' } = useParams();
  const location = useLocation();
  const robotId = decodePathSegment(encodedRobotId);
  const robot = useRobot(robotId);
  const searchParams = new URLSearchParams(location.search);
  const interventionId = searchParams.get('interventionId');
  const siteId = searchParams.get('siteId');
  const siteSearch = siteId === null
    ? ''
    : `?${new URLSearchParams({ siteId }).toString()}`;
  const returnPath = interventionId === null
    ? `/control/monitoring${location.search}`
    : `/control/interventions${siteSearch}`;

  if (robot.status === 'loading') {
    return (
      <ColorSchemeArea className="min-h-dvh p-4 sm:p-6" layer="canvas">
        <Brand compact linked={false} className="mb-4 min-h-0 justify-start" />
        <QueryFeedback kind="loading" />
      </ColorSchemeArea>
    );
  }
  if (robot.status === 'error') {
    return (
      <ColorSchemeArea className="min-h-dvh p-4 sm:p-6" layer="canvas">
        <Brand compact linked={false} className="mb-4 min-h-0 justify-start" />
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
        <Brand compact linked={false} className="mb-4 min-h-0 justify-start" />
        <QueryFeedback kind="not-found" message="관제할 로봇을 찾을 수 없습니다." />
        <div className="justify-self-start">
          <MonitoringExitLink returnPath={returnPath} />
        </div>
      </ColorSchemeArea>
    );
  }

  return (
    <RobotMonitoringContent
      interventionId={interventionId}
      returnPath={returnPath}
      robot={robot.data}
    />
  );
}
