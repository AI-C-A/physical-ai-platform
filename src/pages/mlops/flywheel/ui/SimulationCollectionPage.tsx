import { useCallback, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';

import { useFlywheelPort, useFlywheelQuery } from '@/entities/flywheel';
import { simulationOrigin, useSimulationBridge, useSimulationSession } from '@/entities/simulation-collection';
import { Brand } from '@/shared/ui/brand';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Dialog } from '@/shared/ui/dialog';
import { Icon } from '@/shared/ui/icon';
import { StatusIndicator } from '@/shared/ui/status-indicator';
import { StickyActionBar } from '@/shared/ui/sticky-action-bar';

import { BrowserCameraWorkspace } from './BrowserCameraPanel';
import { AsyncState } from './flywheel-page-shared';
import { feedStatus } from './simulation-feed-status';
import { SimulationConnectionPanel } from './SimulationConnectionPanel';
import { SimulationDataPanel } from './SimulationDataPanel';
import { SimulationMosaic, type MosaicTile } from './SimulationMosaic';
import { SimulationPoseViz } from './SimulationPoseViz';
import './simulation-collection.css';

export function SimulationCollectionPage() {
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const port = useFlywheelPort();
  const loadSession = useCallback((value: ReturnType<typeof useFlywheelPort>) => value.getSession(sessionId), [sessionId]);
  const sessionQuery = useFlywheelQuery(loadSession);
  const [cameraSettingsTarget, setCameraSettingsTarget] = useState<HTMLDivElement | null>(null);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const cameraConnected = useCallback(() => setCameraDialogOpen(false), []);
  const [stageGeneration, setStageGeneration] = useState(0);

  const session = sessionQuery.status === 'ready' && sessionQuery.data?.kind === 'humanoid' ? sessionQuery.data : null;
  const liveSession = session !== null && session.status !== 'completed' && session.status !== 'abandoned';
  // 콘솔이 릴레이에서 5자리 코드를 받아, 관전 iframe과 헤드셋이 같은 코드 방으로 들어가게 한다.
  const relaySession = useSimulationSession({ enabled: liveSession });
  const { feed, latestRef } = useSimulationBridge({ enabled: liveSession });
  const status = feedStatus(feed);
  const consoleLocation = { pathname: `/mlops/collection/${sessionId}`, search: searchParams.toString() };

  // 코드를 받은 뒤에야 관전 iframe을 그 코드 방으로 연다(헤드셋과 반드시 같은 방).
  const stageUrl = relaySession.code === null
    ? null
    : `${simulationOrigin()}/?code=${relaySession.code}&spectate=1&name=MONITOR`;
  const cameraSessionId = session !== null && session.humanDemonstration !== null && session.stoppedAtMs === null && port.supportsBrowserCameras === true
    ? session.id
    : null;

  const tiles: MosaicTile[] = ((): MosaicTile[] => {
    const list: MosaicTile[] = [
      {
        id: 'stage',
        title: '시뮬레이션 · 판교 정비창',
        actions: (
          <>
            {feed.recording ? <StatusIndicator label="녹화 중" pulse tone="negative" /> : <StatusIndicator label={status.label} tone={status.tone} />}
            <Button aria-label="시뮬레이션 다시 불러오기" className="size-8 min-h-0 p-0" onClick={() => setStageGeneration((value) => value + 1)} title="다시 불러오기" variant="ghost">
              <Icon name="restart" />
            </Button>
          </>
        ),
        node: stageUrl === null ? (
          <div className="grid h-full place-items-center p-4 text-center">
            <p className="text-sm text-muted" role="status">
              {relaySession.status === 'connected' ? '세션 코드를 발급받는 중…' : '시뮬레이션 릴레이에 연결하는 중…'}
            </p>
          </div>
        ) : (
          <iframe
            allow="fullscreen; autoplay; xr-spatial-tracking; microphone"
            className="simulation-stage-frame"
            key={`${relaySession.code ?? ''}:${String(stageGeneration)}`}
            src={stageUrl}
            title="시뮬레이션 화면"
          />
        ),
      },
      { id: 'pose', title: '수집 자세 · 손 추적', node: <SimulationPoseViz connected={feed.connected} latestRef={latestRef} /> },
      { id: 'data', title: '실시간 수집 데이터', node: <SimulationDataPanel feed={feed} /> },
      { id: 'connect', title: 'VR 접속 안내', node: <SimulationConnectionPanel participantCount={feed.participants.length} session={relaySession} /> },
    ];
    if (cameraSessionId !== null) {
      list.push({
        id: 'camera',
        title: '수집 카메라 · Body Segmentation',
        node: (
          <BrowserCameraWorkspace
            emptyState={(
              <div className="grid h-full place-items-center gap-3 p-4 text-center">
                <p className="text-sm text-muted">카메라를 연결하면 영상과 Body Segmentation이 함께 표시됩니다.</p>
                <Button onClick={() => setCameraDialogOpen(true)} variant="secondary">카메라 연결</Button>
              </div>
            )}
            onConnected={cameraConnected}
            sessionId={cameraSessionId}
            settingsTarget={cameraSettingsTarget}
          >
            {null}
          </BrowserCameraWorkspace>
        ),
      });
    }
    return list;
  })();

  if (sessionQuery.status === 'ready' && sessionQuery.data === null) {
    return <Navigate replace to="/mlops/collection" />;
  }

  return (
    <>
      {sessionQuery.status !== 'ready' ? <Brand compact linked={false} className="mx-4 mt-3 min-h-0 justify-start" /> : null}
      <AsyncState query={sessionQuery} emptyMessage="수집 세션을 찾을 수 없습니다.">
        {(captureSession) => {
          if (captureSession.kind !== 'humanoid') return <Navigate replace to="/mlops/collection" />;
          if (captureSession.status === 'completed') return <Navigate replace to={`/mlops/catalog/${captureSession.id}`} />;
          if (captureSession.status === 'abandoned') return <Navigate replace to="/mlops/collection" />;
          return (
            <ColorSchemeArea className="flex h-dvh min-h-0 flex-col overflow-hidden" layer="base" scheme="dark">
              <header className="flex h-14 shrink-0 items-center gap-2 px-3 text-foreground sm:gap-3 sm:px-4" data-collection-header>
                <Brand compact linked={false} className="min-h-0" />
                <h1 className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg" title={captureSession.name}>
                  {captureSession.name}
                  <span className="ml-2 text-sm font-medium text-muted">시뮬레이션 수집</span>
                </h1>
                <Link
                  aria-label="수집 콘솔로 돌아가기"
                  className={getButtonClassName('ghost', 'size-10 min-h-0 shrink-0 p-0')}
                  title="수집 콘솔로 돌아가기"
                  to={consoleLocation}
                  viewTransition
                >
                  <Icon name="close" size="md" />
                </Link>
              </header>
              <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 pt-0 sm:p-3 sm:pt-0" data-simulation-viewport>
                <SimulationMosaic tiles={tiles} />
              </div>
              <StickyActionBar
                appearance="plain"
                aria-label="시뮬레이션 수집 컨트롤"
                className="@container static grid shrink-0 gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:flex-wrap sm:items-center sm:justify-between"
                position="contained"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                  <StatusIndicator
                    label={feed.participants.length > 0 ? `${feed.participants[0]!.name} 작업 중` : feed.connected ? '헤드셋 입장 대기' : '연결 대기'}
                    pulse={feed.task !== null}
                    tone={feed.task !== null ? 'negative' : feed.participants.length > 0 ? 'positive' : 'neutral'}
                  />
                  {relaySession.code === null ? null : <span className="text-xs text-muted">인증 코드 <span className="font-mono text-foreground">{relaySession.code}</span></span>}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-3 max-sm:[&>button]:flex-1">
                  {cameraSessionId !== null ? (
                    <Dialog cancelLabel="닫기" onOpenChange={setCameraDialogOpen} open={cameraDialogOpen} title="카메라 연결" trigger={<Button variant="secondary">카메라 연결</Button>}>
                      <div ref={setCameraSettingsTarget} />
                    </Dialog>
                  ) : null}
                  <Link className={getButtonClassName('primary')} to={consoleLocation} viewTransition>수집 콘솔</Link>
                </div>
              </StickyActionBar>
            </ColorSchemeArea>
          );
        }}
      </AsyncState>
    </>
  );
}
