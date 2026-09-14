import { useCallback, useEffect, useRef, useState } from 'react';

import { useFlywheelPort, type HumanoidCaptureSession } from '@/entities/flywheel';
import { DeviceConnectionCode } from './DeviceConnectionCode';

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
  const [prepareOnOpen, setPrepareOnOpen] = useState(() => {
    const binding = session.humanDemonstration;
    const connected = binding?.sourceBindings.some((item) => item.role === 'xr-hand-tracking'
      && ['paired', 'ready', 'recording'].includes(item.state));
    return binding != null && !connected;
  });
  const [issuedPairing, setIssuedPairing] = useState<{
    previousCode: string | undefined;
    pairing: NonNullable<HumanoidCaptureSession['humanDemonstration']>['pairing'];
  } | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const previousCode = session.humanDemonstration?.pairing.code;
  const renew = useCallback(async () => {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setPending(true);
    setError(null);
    try {
      const updated = await port.renewHumanDemonstrationPairing(session.id);
      setNow(Date.now());
      setRenewedCode(updated.humanDemonstration?.pairing.code ?? null);
      if (updated.humanDemonstration !== null) {
        setIssuedPairing({ previousCode, pairing: updated.humanDemonstration.pairing });
      }
    } catch {
      setError('새 코드를 받지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.');
    } finally {
      submissionRef.current = false;
      setPending(false);
      setPrepareOnOpen(false);
    }
  }, [port, session.id, previousCode]);

  useEffect(() => {
    if (!prepareOnOpen || disabled) return;
    // Defer until mounted; cleanup also cancels the StrictMode probe.
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) void renew(); });
    return () => { cancelled = true; };
  }, [prepareOnOpen, disabled, renew]);

  const binding = session.humanDemonstration;
  if (binding === null) return null;
  const pairing = issuedPairing?.previousCode === binding.pairing.code ? issuedPairing.pairing : binding.pairing;
  const source = binding.sourceBindings.find((item) => item.role === 'xr-hand-tracking');
  const paired = source !== undefined && ['paired', 'ready', 'recording'].includes(source.state);
  if (paired) return <section aria-label="Quest 연결" className="grid gap-2">
    <h2 className="text-base font-semibold">Quest 연결 완료</h2>
    <p className="text-sm text-muted">{source.state === 'paired' ? 'Quest에서 손 추적을 시작하세요.' : '손 추적 중'}</p>
  </section>;

  return <div className={compact ? 'collection-pairing' : undefined}>
    <DeviceConnectionCode label="Quest" device="Quest" path="/collect/quest" code={error ? null : pairing.code}
      expiresAtMs={pairing.expiresAtMs} now={now} pending={pending || (prepareOnOpen && error === null)} error={error}
      onRenew={() => { if (!disabled) void renew(); }} />
    {renewedCode === pairing.code ? <span role="status" className="sr-only">새 코드가 발급되었습니다.</span> : null}
  </div>;
}
