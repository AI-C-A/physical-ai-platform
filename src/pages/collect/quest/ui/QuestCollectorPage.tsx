import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  getQuestRuntimeModeLabel,
  useQuestCollector,
  useQuestCollectorPort,
  type Handedness,
  type QuestCollectorSnapshot,
} from '@/entities/hand-pose';
import { formatRelativeTime } from '@/shared/lib/format';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { OperationalStrip } from '@/shared/ui/operational-strip';
import { Panel } from '@/shared/ui/panel';
import { StatusIndicator, type StatusIndicatorTone } from '@/shared/ui/status-indicator';

function stateTone(state: string): StatusIndicatorTone {
  if (state === 'supported' || state === 'paired' || state === 'running' || state === 'live'
    || state === 'recording' || state === 'tracking' || state === 'acknowledged') return 'neutral';
  if (state === 'checking' || state === 'pairing' || state === 'starting' || state === 'reconnecting'
    || state === 'partial' || state === 'pending' || state === 'stopping' || state === 'review') return 'warning';
  if (state === 'idle' || state === 'unpaired' || state === 'offline') return 'neutral';
  return 'negative';
}

function stateLabel(state: string): string {
  const labels: Readonly<Record<string, string>> = {
    acknowledged: '확인 완료',
    checking: '확인 중',
    connecting: '연결 중',
    ending: '종료 중',
    error: '오류',
    idle: '대기',
    live: '연결 정상',
    lost: '추적 유실',
    offline: '오프라인',
    paired: '페어링 완료',
    pairing: '페어링 중',
    partial: '부분 관측',
    pending: '응답 대기',
    reconnecting: '재연결 중',
    recording: '녹화 중',
    review: '검토 대기',
    running: 'MR 실행 중',
    starting: '시작 중',
    stopping: '원본 전송 중',
    supported: '사용 가능',
    tracking: '추적 정상',
    unavailable: '지원되지 않음',
    unpaired: '페어링 필요',
    unsupported: '지원되지 않음',
  };
  return labels[state] ?? state;
}

function backendDetail(snapshot: QuestCollectorSnapshot): string {
  if (snapshot.backend.detail !== null) return snapshot.backend.detail;
  if (snapshot.backend.state === 'live') return 'Session command와 frame 채널이 연결되었습니다.';
  if (snapshot.backend.state === 'connecting' || snapshot.backend.state === 'reconnecting') return 'Backend 채널을 연결하고 있습니다.';
  if (snapshot.backend.state === 'unavailable') return '이 환경에는 Backend 연결 기능이 구성되지 않았습니다.';
  if (snapshot.backend.state === 'error') return 'Backend 연결에 실패했습니다. 다시 연결하세요.';
  return 'Backend 채널이 연결되지 않았습니다.';
}

function HandStatusRow({ handedness, snapshot }: {
  readonly handedness: Handedness;
  readonly snapshot: QuestCollectorSnapshot;
}) {
  const hand = snapshot.hands[handedness];
  const label = handedness === 'left' ? '왼손' : '오른손';
  return (
    <div
      aria-label={`${label} Hand Pose 상태`}
      className="grid min-h-20 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">{label}</h3>
          {hand.qualityState === 'tracking' ? <span className="text-sm text-muted">추적 정상</span> : <StatusIndicator label={snapshot.immersive.state !== 'running' ? 'MR 시작 대기' : stateLabel(hand.qualityState)} tone={snapshot.immersive.state !== 'running' ? 'neutral' : stateTone(hand.qualityState)} />}
        </div>
        <p className="mt-1 text-xs text-muted">
          {hand.poseObserved ? '손 움직임 수신 중' : hand.sourcePresent ? '손 위치 확인 중' : '손 움직임 수신 전'}
          {hand.lastObservedAtMs === null ? '' : ` · ${formatRelativeTime(hand.lastObservedAtMs)} 관측`}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-5 text-xs sm:text-right">
        <div><dt className="text-muted">관절</dt><dd className="mt-1 font-semibold tabular-nums">{String(hand.validJointCount)}/25</dd></div>
        <div><dt className="text-muted">관측률</dt><dd className="mt-1 font-semibold tabular-nums">{hand.observedRateHz === null ? '—' : `${hand.observedRateHz.toFixed(1)} Hz`}</dd></div>
        <div><dt className="text-muted">연속 누락</dt><dd className={`mt-1 font-semibold tabular-nums ${hand.consecutiveMissingMs > 0 ? 'text-warning' : ''}`}>{String(hand.consecutiveMissingMs)} ms</dd></div>
      </dl>
    </div>
  );
}

export function QuestCollectorPage() {
  const port = useQuestCollectorPort();
  const snapshot = useQuestCollector();
  const [searchParams] = useSearchParams();
  const [pairingCode, setPairingCode] = useState(searchParams.get('code') ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const leaveCollector = (): void => port.leaveCollector();
    globalThis.addEventListener('pagehide', leaveCollector);
    void port.checkSupport();
    return () => {
      globalThis.removeEventListener('pagehide', leaveCollector);
      leaveCollector();
    };
  }, [port]);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Collector 작업을 완료하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  const pairedSessionPath = snapshot.pairing.sessionId === null
    ? null
    : `/mlops/collection/${snapshot.pairing.sessionId}`;
  const canEnterImmersive = snapshot.pairing.state === 'paired'
    && snapshot.support.state === 'supported'
    && snapshot.immersive.state !== 'running';

  return (
    <ColorSchemeArea className="min-h-dvh bg-background text-foreground" layer="base" scheme="dark">
      <main className="mx-auto grid min-h-dvh w-full max-w-5xl content-start gap-4 p-[var(--layout-page-gutter)]">
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border pb-3">
          <div>
            <h1 className="text-xl font-bold">Quest Hand Pose 수집</h1>
          </div>
          {pairedSessionPath === null ? null : (
            <Link className={getButtonClassName('ghost', 'min-h-10 px-3')} to={pairedSessionPath}>
              PC 세션 보기
            </Link>
          )}
        </header>

        <OperationalStrip
          aria-label="Collector 운영 상태"
          columns={3}
          items={[
            {
              label: '실행 환경',
              value: snapshot.support.state === 'supported' ? <span>사용 가능</span> : <StatusIndicator label={stateLabel(snapshot.support.state)} tone={stateTone(snapshot.support.state)} />,
              detail: `${snapshot.support.secureContext ? '보안 연결' : '보안 연결 필요'} · ${getQuestRuntimeModeLabel(snapshot.support.runtimeMode)}`,
            },
            {
              label: '장치 연결',
              value: snapshot.backend.state === 'live' ? <span>연결 정상</span> : <StatusIndicator label={stateLabel(snapshot.backend.state)} tone={stateTone(snapshot.backend.state)} />,
              detail: snapshot.pairing.state === 'paired' ? 'PC 수집 세션에 연결됨' : '세션 연결 대기',
            },
            {
              label: '녹화 명령',
              value: <StatusIndicator label={stateLabel(snapshot.recording.state)} pulse={snapshot.recording.state === 'recording'} tone={snapshot.recording.state === 'recording' ? 'negative' : stateTone(snapshot.recording.state)} />,
              detail: snapshot.recording.episodeId ?? 'PC에서 녹화를 시작하세요',
            },
          ]}
        />

        {snapshot.support.state === 'supported' || snapshot.support.state === 'checking' ? null : (
          <div className="rounded-[var(--design-radius-control)] bg-status-negative-background px-4 py-3 text-sm text-status-negative-foreground" role="alert">
            <p className="font-semibold">이 환경에서는 Quest Hand Tracking을 시작할 수 없습니다.</p>
            <p className="mt-1 text-xs leading-5">{snapshot.support.detail}</p>
          </div>
        )}

        {snapshot.pairing.state !== 'paired' ? (
          <Panel
            title="세션 연결"
            description="PC 수집 화면에 표시된 6자리 코드를 입력하세요."
          >
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => port.pair(pairingCode));
              }}
            >
              <Input
                autoComplete="one-time-code"
                inputMode="numeric"
                label="6자리 페어링 코드"
                maxLength={6}
                onChange={(event) => setPairingCode(event.target.value.replace(/\D/gu, '').slice(0, 6))}
                pattern="[0-9]{6}"
                required
                value={pairingCode}
              />
              <Button
                className="min-h-12"
                disabled={pairingCode.length !== 6 || snapshot.backend.state === 'unavailable' || snapshot.support.state !== 'supported'}
                isLoading={pending}
                type="submit"
              >
                {snapshot.backend.state === 'unavailable' ? 'Backend 미구성' : 'Session 연결'}
              </Button>
            </form>
            {snapshot.backend.state === 'unavailable' ? (
              <p className="mt-3 text-xs leading-5 text-warning">Real Backend pairing 계약이 구성되어야 Session을 연결할 수 있습니다.</p>
            ) : null}
          </Panel>
        ) : (
          <section aria-label="연결된 세션" className="border-b border-border py-3">
            <dl className="grid gap-3 break-words text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">세션</dt>
                <dd className="mt-1 font-semibold">{snapshot.pairing.sessionId}</dd>
              </div>
              <div>
                <dt className="text-muted">참여자</dt>
                <dd className="mt-1 font-semibold">{snapshot.pairing.participantId}</dd>
              </div>
              <div>
                <dt className="text-muted">수집 장치</dt>
                <dd className="mt-1 font-semibold">{snapshot.pairing.sourceDeviceId}</dd>
              </div>
            </dl>
          </section>
        )}

        {error === null ? null : (
          <div className="rounded-[var(--design-radius-control)] bg-status-negative-background px-4 py-3 text-sm text-status-negative-foreground" role="alert">
            {error}
          </div>
        )}

        <Panel title="손 추적">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <StatusIndicator label={stateLabel(snapshot.immersive.state)} tone={snapshot.immersive.state === 'running' ? 'positive' : stateTone(snapshot.immersive.state)} />
              <p className="mt-2 text-sm leading-6 text-muted">
                {snapshot.immersive.state === 'running' ? '손 추적을 유지한 채 PC에서 녹화를 진행하세요.' : snapshot.pairing.state === 'paired' ? 'MR 모드를 시작하고 손 추적 권한을 허용하세요.' : '세션을 연결한 뒤 MR 모드를 시작하세요.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {snapshot.pairing.state === 'paired' && (snapshot.backend.state === 'reconnecting' || snapshot.backend.state === 'error' || snapshot.backend.state === 'offline') ? (
                <Button className="min-h-12" isLoading={pending} onClick={() => void run(() => port.reconnectBackend())} variant="secondary">
                  Backend 다시 연결
                </Button>
              ) : null}
              {snapshot.immersive.state === 'running' ? (
                <Button className="min-h-12" isLoading={pending} onClick={() => void run(() => port.endImmersiveSession())} variant="secondary">
                  <Icon name="stop" />
                  MR 모드 종료
                </Button>
              ) : (
                <Button className="min-h-12" disabled={!canEnterImmersive} isLoading={pending} onClick={() => void run(() => port.startImmersiveSession())}>
                  <Icon name="play" />
                  MR 모드 시작
                </Button>
              )}
            </div>
          </div>
          <section aria-label="좌우 Hand Pose" className="divide-y divide-border">
            <HandStatusRow handedness="left" snapshot={snapshot} />
            <HandStatusRow handedness="right" snapshot={snapshot} />
          </section>
        </Panel>

        <details className="border-t border-border py-3">
          <summary className="min-h-10 cursor-pointer content-center rounded-[var(--design-radius-control)] text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">연결·전송 상세</summary>
          <div className="grid gap-4 pt-3">
          <p className="text-sm text-muted">{backendDetail(snapshot)}</p>
          {snapshot.immersive.detail === null ? null : <p className="text-sm text-muted">{snapshot.immersive.detail}</p>}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted">대기 frame</dt><dd className="mt-1 font-semibold tabular-nums">{snapshot.backend.queuedFrameCount}</dd></div>
            <div><dt className="text-muted">전송 frame</dt><dd className="mt-1 font-semibold tabular-nums">{snapshot.backend.sentFrameCount}</dd></div>
            <div><dt className="text-muted">drop-oldest</dt><dd className="mt-1 font-semibold tabular-nums">{snapshot.backend.droppedFrameCount}</dd></div>
            <div><dt className="text-muted">마지막 Backend 수신</dt><dd className="mt-1 font-semibold tabular-nums" title={snapshot.backend.lastReceivedTimestampMs === null ? undefined : new Date(snapshot.backend.lastReceivedTimestampMs).toLocaleString('ko-KR')}>{snapshot.backend.lastReceivedTimestampMs === null ? '수신 기록 없음' : formatRelativeTime(snapshot.backend.lastReceivedTimestampMs)}</dd></div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-muted">
            화면에는 집계 상태만 표시합니다. 원본 frame은 bounded queue에서 짧게 batch 처리하며 tracking loss를 pose로 보간하지 않습니다.
          </p>
          <p className="text-xs leading-5 text-muted">MR 종료는 Quest 장치만 오프라인으로 바꾸며 다른 수집 장치를 종료하지 않습니다. 페어링 코드는 인증 토큰이 아니며 인증정보를 브라우저에 저장하지 않습니다.</p>
          </div>
        </details>
      </main>
    </ColorSchemeArea>
  );
}
