import { useCallback, useEffect, useRef, useState } from 'react';

import { simulationOrigin, type SimulationSession } from '@/entities/simulation-collection';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

/** 클립보드 복사 + "복사됨" 잠깐 표시. 클립보드가 막힌 환경(비보안 컨텍스트 등)은 조용히 무시한다. */
function useCopy(): { readonly copied: boolean; readonly copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const copy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1_500);
    }).catch(() => { /* 클립보드 불가: 주소는 화면에 그대로 있으니 무시 */ });
  }, []);
  return { copied, copy };
}

/**
 * VR로 접속하는 안내. 콘솔이 릴레이에서 5자리 세션 코드를 발급받으면, 헤드셋에서 같은
 * 링크를 열고 그 코드를 입력해 같은 방으로 들어온다. 콘솔의 관전 iframe도 같은 코드로 열려
 * 헤드셋 시점을 미러링하므로, 코드만 맞으면 화면과 데이터가 함께 연동된다.
 */
export function SimulationConnectionPanel({ session, participantCount }: {
  readonly session: SimulationSession;
  readonly participantCount: number;
}) {
  const code = session.code;
  const origin = session.publicOrigin ?? simulationOrigin();
  const headsetUrl = code === null ? `${origin}/` : `${origin}/?code=${code}`;
  const localOnly = /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)/u.test(origin);
  const urlCopy = useCopy();
  const codeCopy = useCopy();
  return (
    <div className="simulation-connect grid gap-4">
      <div className="grid gap-1">
        <p className="text-xs font-medium text-muted">헤드셋 인증 코드</p>
        <div className="flex items-center gap-2">
          <output aria-label="인증 코드" className="simulation-connect-code text-foreground">{code ?? '·····'}</output>
          {code === null ? null : (
            <Button aria-label="인증 코드 복사" className="size-9 min-h-0 shrink-0 p-0" onClick={() => codeCopy.copy(code)} title={codeCopy.copied ? '복사됨' : '코드 복사'} variant="ghost">
              <Icon name={codeCopy.copied ? 'check' : 'download'} />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted" role="status">
          {session.status !== 'connected'
            ? '릴레이에 연결하는 중입니다…'
            : code === null
              ? '릴레이에서 코드를 발급받는 중입니다…'
              : participantCount > 0
                ? `참가자 ${String(participantCount)}명 연결됨`
                : '헤드셋 입장 대기 중'}
        </p>
      </div>

      <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-6 text-muted">
        <li>Quest 브라우저에서 아래 <strong className="text-foreground">접속 주소</strong>를 엽니다.</li>
        <li>로비에서 위 <strong className="text-foreground">5자리 인증 코드</strong>를 입력합니다(코드가 붙은 링크로 열면 자동 입력).</li>
        <li><strong className="text-foreground">VR로 입장</strong> 후 스테이션 받침대의 START 버튼으로 작업을 시작합니다.</li>
      </ol>

      <div className="grid gap-1">
        <p className="text-xs font-medium text-muted">헤드셋 접속 주소</p>
        <div className="flex items-center gap-2">
          <code aria-label="헤드셋 접속 주소" className="min-w-0 flex-1 break-all text-sm text-foreground">{headsetUrl}</code>
          <Button aria-label="접속 주소 복사" className="size-9 min-h-0 shrink-0 p-0" onClick={() => urlCopy.copy(headsetUrl)} title={urlCopy.copied ? '복사됨' : '주소 복사'} variant="ghost">
            <Icon name={urlCopy.copied ? 'check' : 'download'} />
          </Button>
        </div>
        {localOnly ? <p className="text-xs text-warning">이 주소는 이 PC에서만 열립니다. 헤드셋에서 열리게 하려면 WebXR 서버에서 Tailscale Funnel을 켜세요.</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <a className={getButtonClassName('secondary')} href={code === null ? headsetUrl : `${origin}/?code=${code}&name=PC`} rel="noreferrer" target="_blank">PC로도 참가</a>
        <a className={getButtonClassName('ghost')} href={headsetUrl} rel="noreferrer" target="_blank">주소 새 창에서 열기</a>
      </div>
    </div>
  );
}
