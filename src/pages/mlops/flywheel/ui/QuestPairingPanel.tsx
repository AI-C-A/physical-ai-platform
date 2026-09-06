import { useEffect, useRef, useState } from 'react';

import { useFlywheelPort, type HumanoidCaptureSession } from '@/entities/flywheel';
import { Button } from '@/shared/ui/button';

export function QuestPairingPanel({ session, disabled = false, compact = false }: {
  readonly session: HumanoidCaptureSession;
  readonly disabled?: boolean;
  readonly compact?: boolean;
}) {
  const port = useFlywheelPort();
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renewedCode, setRenewedCode] = useState<string | null>(null);
  const submissionRef = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const binding = session.humanDemonstration;
  if (binding === null) return null;
  const source = binding.sourceBindings.find((item) => item.role === 'xr-hand-tracking');
  const paired = source !== undefined && ['paired', 'ready', 'recording'].includes(source.state);
  const expired = binding.pairing.expiresAtMs !== null && binding.pairing.expiresAtMs <= now;
  const seconds = binding.pairing.expiresAtMs === null ? null : Math.max(0, Math.ceil((binding.pairing.expiresAtMs - now) / 1_000));
  const remaining = seconds === null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  async function renew() {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setPending(true);
    setError(null);
    try {
      const updated = await port.renewHumanDemonstrationPairing(session.id);
      setNow(Date.now());
      setRenewedCode(updated.humanDemonstration?.pairing.code ?? null);
    } catch {
      setError('새 코드를 받지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.');
    } finally {
      submissionRef.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-label="Quest 연결" className={compact ? 'collection-pairing grid gap-3' : 'grid gap-4'}>
      <div role="status" aria-live="polite" aria-atomic="true" className="grid gap-1">
        {paired || expired ? <h2 className="text-base font-semibold">
          {paired ? 'Quest 연결 완료' : '연결 코드가 만료되었습니다'}
        </h2> : null}
        {paired || expired ? <p className="text-sm leading-6 text-muted">
          {paired ? source.state === 'paired' ? 'Quest에서 MR 모드를 시작하고 손 추적 권한을 허용하세요.' : '손 추적이 준비되었습니다. 수집 콘솔에서 계속하세요.'
            : '새 코드를 받아 연결을 이어가세요. 세션 설정과 수집 기록은 유지됩니다.'}
        </p> : <p className="text-sm leading-6 text-muted">Quest 브라우저에서 <code className="text-foreground">/collect/quest</code>를 열고 아래 코드를 입력하세요.</p>}
        {!paired && !expired && renewedCode === binding.pairing.code ? <span className="sr-only">새 코드가 발급되었습니다.</span> : null}
      </div>
      {!paired && !expired ? (
        <div className="grid gap-2 rounded-[var(--design-radius-control)] bg-layer-raised px-4 py-4 text-center">
          <output aria-label="Quest pairing code" className={`${compact ? 'text-2xl' : 'text-4xl'} block font-mono font-bold tracking-widest tabular-nums`}>
            {binding.pairing.code}
          </output>
        </div>
      ) : null}
      {!paired ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!expired && remaining !== null ? <p role="timer" aria-live="off" className="text-xs text-muted"><span className="tabular-nums">{remaining}</span> 후 만료</p> : null}
          <Button variant={expired ? 'primary' : 'ghost'} disabled={disabled} isLoading={pending} onClick={() => void renew()}>새 코드 받기</Button>
        </div>
      ) : null}
      {!paired && error ? <p role="alert" className="text-sm leading-6 text-negative">{error}</p> : null}
    </section>
  );
}
