import { useEffect, useState } from 'react';

import { useFlywheelPort, type FlywheelCaptureSession } from '@/entities/flywheel';

export function useAutomaticPreflight(session: FlywheelCaptureSession | null) {
  const port = useFlywheelPort();
  const sessionId = session?.id ?? null;
  const eligible = session?.kind === 'humanoid' && session.stoppedAtMs === null
    && session.activeEpisodeId === null && ['draft', 'ready', 'failed'].includes(session.status);
  const sources = session?.kind === 'humanoid' ? session.humanDemonstration?.sourceBindings : undefined;
  const sourcesReady = sources === undefined || sources.filter((source) => source.required)
    .every((source) => source.state === 'ready' || source.state === 'recording');
  const validationKey = eligible ? JSON.stringify([sessionId, sources?.map((source) => [source.sourceDeviceId, source.state])]) : null;
  const [result, setResult] = useState<{ key: string; error: string | null } | null>(null);

  useEffect(() => {
    if (sessionId === null || validationKey === null) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      try {
        await port.validateSession(sessionId!);
        if (!cancelled) setResult({ key: validationKey!, error: null });
      } catch {
        if (cancelled) return;
        setResult({ key: validationKey!, error: sourcesReady
          ? '수집 준비 상태를 확인하지 못했습니다. 연결 상태를 확인하세요.'
          : '필수 장치 연결 대기 중입니다. 연결되면 자동으로 확인합니다.' });
        if (sourcesReady) retryTimer = setTimeout(() => void check(), 5_000);
      }
    }
    void check();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [port, sessionId, validationKey, sourcesReady]);

  return {
    checking: validationKey !== null && result?.key !== validationKey,
    error: validationKey !== null && result?.key === validationKey ? result.error : null,
  };
}
