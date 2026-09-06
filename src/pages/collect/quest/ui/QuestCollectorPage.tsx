import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useQuestCollector, useQuestCollectorPort } from '@/entities/hand-pose';
import { Button } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Input } from '@/shared/ui/input';
import { StatusIndicator } from '@/shared/ui/status-indicator';

export function QuestCollectorPage() {
  const port = useQuestCollectorPort();
  const snapshot = useQuestCollector();
  const [searchParams] = useSearchParams();
  const [pairingCode, setPairingCode] = useState(searchParams.get('code')?.replace(/\D/gu, '').slice(0, 6) ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submissionRef = useRef(false);

  useEffect(() => {
    const leaveCollector = (): void => port.leaveCollector();
    globalThis.addEventListener('pagehide', leaveCollector);
    void port.checkSupport();
    return () => {
      globalThis.removeEventListener('pagehide', leaveCollector);
      leaveCollector();
    };
  }, [port]);

  async function run(action: () => Promise<unknown>, failureMessage = '작업을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.'): Promise<void> {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(failureMessage);
    } finally {
      setPending(false);
      submissionRef.current = false;
    }
  }

  const paired = snapshot.pairing.state === 'paired';
  const running = snapshot.immersive.state === 'running';
  const supported = snapshot.support.state === 'supported';
  const needsReconnect = paired && ['reconnecting', 'error', 'offline'].includes(snapshot.backend.state);
  const recordingLabel = snapshot.recording.state === 'recording' ? '녹화 중'
    : snapshot.recording.state === 'stopping' ? '원본 전송 중'
      : snapshot.recording.state === 'review' ? '검토 대기'
        : snapshot.recording.state === 'error' ? '녹화 오류' : '녹화 대기';
  const operationError = error
    ?? (snapshot.recording.state === 'error' ? '녹화를 완료하지 못했습니다. PC에서 수집 상태를 확인하세요.' : null)
    ?? (snapshot.immersive.state === 'error' ? 'MR 모드를 시작하지 못했습니다. 권한과 기기 연결을 확인하고 다시 시도하세요.' : null);

  return (
    <ColorSchemeArea className="min-h-dvh text-foreground" layer="base" scheme="dark">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
        <header>
          <h1 className="text-2xl font-bold">Quest 손 추적</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {!paired ? 'PC에 표시된 연결 코드를 입력하세요.'
              : running ? '손 추적을 유지하세요. 녹화는 PC에서 조작합니다.'
                : 'MR 모드를 시작하고 손 추적 권한을 허용하세요.'}
          </p>
        </header>

        {!supported && snapshot.support.state !== 'checking' ? (
          <div role="alert" className="text-sm leading-6 text-negative">
            <p>이 기기에서 손 추적을 시작할 수 없습니다.</p>
            <p>{snapshot.support.secureContext ? '기기의 손 추적 지원 여부와 브라우저 권한을 확인하세요.' : '보안 연결이 필요합니다. HTTPS 주소로 접속하세요.'}</p>
          </div>
        ) : null}

        {!paired ? (
          <form className="grid gap-4" onSubmit={(event) => {
            event.preventDefault();
            if (pairingCode.length !== 6 || !supported || snapshot.backend.state === 'unavailable') return;
            void run(() => port.pair(pairingCode), '세션에 연결하지 못했습니다. PC의 연결 코드와 연결 상태를 확인하고 다시 시도하세요.');
          }}>
            <Input label="6자리 페어링 코드" inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} pattern="[0-9]{6}" required disabled={pending}
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value.replace(/\D/gu, '').slice(0, 6))}
            />
            <Button className="min-h-12" disabled={pairingCode.length !== 6 || !supported || snapshot.backend.state === 'unavailable'} isLoading={pending} type="submit">
              세션 연결
            </Button>
            {snapshot.backend.state === 'unavailable' ? <p role="alert" className="text-sm text-warning">수집 서버가 설정되지 않았습니다. 관리자에게 연결 설정을 요청하세요.</p> : null}
            {snapshot.support.state === 'checking' ? <p role="status" className="text-sm text-muted">손 추적 지원 확인 중</p> : null}
          </form>
        ) : (
          <section aria-label="연결된 세션" className="grid gap-5">
            <p className="text-sm text-muted">PC 수집 세션에 연결되었습니다.</p>
            {running ? (
              <>
                <section aria-label="Collector 운영 상태" className="grid gap-4" aria-live="polite">
                  <StatusIndicator label={recordingLabel} pulse={snapshot.recording.state === 'recording'} tone={snapshot.recording.state === 'recording' || snapshot.recording.state === 'error' ? 'negative' : 'neutral'} />
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {(['left', 'right'] as const).map((side) => {
                      const label = side === 'left' ? '왼손' : '오른손';
                      const quality = snapshot.hands[side].qualityState;
                      return <span key={side} aria-label={`${label} Hand Pose 상태`} className={quality === 'tracking' ? 'text-muted' : 'text-warning'}>
                        {label} · {quality === 'tracking' ? '추적 정상' : quality === 'partial' ? '추적 불안정' : '추적 끊김'}
                      </span>;
                    })}
                  </div>
                </section>
                <Button className="min-h-12" isLoading={pending} variant="secondary" onClick={() => void run(() => port.endImmersiveSession())}>MR 모드 종료</Button>
              </>
            ) : (
              <Button className="min-h-12" disabled={!supported || needsReconnect} isLoading={pending} onClick={() => void run(() => port.startImmersiveSession())}>MR 모드 시작</Button>
            )}
            {needsReconnect ? (
              <div className="grid gap-3">
                <p role="alert" className="text-sm text-warning">PC와 연결이 끊겼습니다. 다시 연결하세요.</p>
                <Button className="min-h-12" isLoading={pending} variant="secondary" onClick={() => void run(() => port.reconnectBackend())}>다시 연결</Button>
              </div>
            ) : null}
          </section>
        )}
        {operationError ? <p role="alert" className="text-sm leading-6 text-negative">{operationError}</p> : null}
      </main>
    </ColorSchemeArea>
  );
}
