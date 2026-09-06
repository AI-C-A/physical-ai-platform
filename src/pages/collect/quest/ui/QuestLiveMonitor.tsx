import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

import { loadQuestHandPoseViewer } from '@/entities/flywheel';
import type { QuestLivePreviewPort } from '@/entities/hand-pose';
import { Button } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { StatusIndicator } from '@/shared/ui/status-indicator';

import { useQuestLiveMonitor } from '../model/use-quest-live-monitor';

const QuestHandPoseViewer = lazy(async () => ({ default: (await loadQuestHandPoseViewer()).QuestHandPoseViewer }));

export function QuestLiveMonitor({ port }: { readonly port: QuestLivePreviewPort }) {
  const { session, snapshot, error, pending, create, close } = useQuestLiveMonitor(port);
  const sourceState = snapshot?.sourceState;
  const receiving = snapshot?.frame !== null && snapshot?.frame !== undefined;
  const status = error !== null ? '서버 연결 확인 필요'
    : receiving ? '손 데이터 수신 중'
      : sourceState === 'stale' ? '수신 지연'
        : sourceState === 'offline' ? 'Quest 추적 종료'
          : sourceState === 'paired' || sourceState === 'ready' ? 'Quest 연결됨 · 손 추적 시작 대기'
            : 'Quest 연결 대기';
  const questUrl = new URL('/collect/quest', window.location.origin);
  if (session !== null) questUrl.searchParams.set('code', session.pairingCode);

  return (
    <ColorSchemeArea className="min-h-dvh text-foreground" layer="base" scheme="dark">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="grid gap-2">
          <h1 className="text-2xl font-bold">Quest 손 추적 · PC 보기</h1>
          <p className="text-sm leading-6 text-muted">Quest에서 추적한 양손 관절을 실시간으로 확인합니다. 이 연결에서는 녹화본을 저장하지 않습니다.</p>
        </header>
        {session === null ? (
          <section aria-label="Quest 연결 준비" className="grid justify-items-start gap-4">
            <p className="text-sm leading-6 text-muted">연결 코드를 만든 뒤 Quest 브라우저에서 같은 사이트의 손 추적 화면을 여세요.</p>
            <Button className="min-h-12" isLoading={pending} onClick={() => void create()}>Quest 연결 코드 만들기</Button>
          </section>
        ) : (
          <>
            <section aria-label="Quest 연결 정보" className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="grid gap-1">
                  <span className="text-sm text-muted">Quest에 입력할 연결 코드</span>
                  <strong className="text-3xl font-bold tabular-nums" aria-label="Quest 연결 코드">{session.pairingCode}</strong>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button className="min-h-12" variant="secondary" isLoading={pending} onClick={() => void create()}>새 연결 코드 만들기</Button>
                  <Button className="min-h-12" variant="secondary" isLoading={pending} onClick={() => void close()}>연결 종료</Button>
                </div>
              </div>
              <p className="text-sm leading-6 text-muted">코드는 발급 후 5분 동안 한 번 사용할 수 있습니다. Quest에서 세션 연결 후 MR 모드를 시작하세요.</p>
              <a className="break-all text-sm text-foreground underline underline-offset-4" href={questUrl.href} target="_blank" rel="noreferrer">{questUrl.href}</a>
            </section>
            <section aria-label="실시간 손 추적" className="grid gap-4">
              <div role="status">
                <StatusIndicator label={status} pulse={receiving} tone={error !== null || sourceState === 'stale' ? 'warning' : receiving ? 'positive' : 'neutral'} />
              </div>
              <Suspense fallback={<p role="status" className="text-sm text-muted">손 관절 보기 준비 중</p>}>
                <QuestHandPoseViewer
                className="min-h-80"
                handPose={snapshot?.frame ?? null}
                streamState={receiving ? 'live' : error !== null || sourceState === 'stale' ? 'stale' : 'idle'}
                />
              </Suspense>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                {(['left', 'right'] as const).map((side) => (
                  <span key={side}>{side === 'left' ? '왼손' : '오른손'} 관절 {snapshot?.frame?.hands[side].joints.length ?? 0}/25</span>
                ))}
                <span>수신 프레임 {snapshot?.frameCount ?? 0}</span>
              </div>
            </section>
          </>
        )}
        {error !== null ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
        <Link className="self-start py-3 text-sm text-muted underline underline-offset-4" to="/collect/quest">Quest에서 손 추적 보내기</Link>
      </main>
    </ColorSchemeArea>
  );
}
