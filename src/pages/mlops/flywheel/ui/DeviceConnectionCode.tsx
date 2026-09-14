import { collectorAddress } from './collector-address';
import { Button } from '@/shared/ui/button';

export function DeviceConnectionCode({ label, device, path, code, expiresAtMs, now, pending = false, error, onRenew, showLabel = false }: {
  readonly label: string;
  readonly device: string;
  readonly path: string;
  readonly code: string | null;
  readonly expiresAtMs: number | null;
  readonly now: number;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly onRenew: () => void;
  readonly showLabel?: boolean;
}) {
  const seconds = expiresAtMs === null ? null : Math.min(300, Math.max(0, Math.ceil((expiresAtMs - now) / 1_000)));
  const expired = seconds === 0;
  const address = collectorAddress(path);
  return <section aria-label={`${label} 연결 안내`} className="grid gap-4">
    {showLabel ? <h3 className="text-sm font-semibold">{label}</h3> : null}
    <p className="text-sm leading-6 text-muted">{device} 브라우저에서 아래 주소를 열고 연결 코드를 입력하세요.</p>
    <code className="break-all text-sm text-foreground">{address}</code>
    <div className="grid justify-items-center gap-2 rounded-[var(--design-radius-control)] bg-layer-raised px-4 py-5 text-center">
      {pending ? <p role="status" className="text-sm text-muted">연결 코드 발급 중…</p>
        : expired || code === null ? <p role="status" className="text-sm text-muted">{error ? '연결 코드를 발급하지 못했습니다.' : '연결 코드가 만료되었습니다.'}</p>
          : <><output aria-label={`${label} 연결 코드`} className="font-mono text-4xl font-bold tracking-widest tabular-nums">{code}</output>
            {seconds === null ? null : <p role="timer" aria-live="off" className="text-xs text-muted">남은 시간 <span className="tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></p>}</>}
      {!pending && (expired || code === null || error) ? <Button variant="secondary" onClick={onRenew}>새 코드 받기</Button> : null}
    </div>
    {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
  </section>;
}
