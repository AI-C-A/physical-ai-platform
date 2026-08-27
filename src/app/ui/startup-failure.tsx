import { Button } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Spinner } from '@/shared/ui/spinner';

import './startup-failure.css';

interface StartupFailureProps {
  readonly message: string;
}

export function StartupFailure({ message }: StartupFailureProps) {
  return (
    <main className="startup-status startup-status--failure">
      <section aria-labelledby="startup-failure-title">
        <p className="startup-status__eyebrow">런타임 설정</p>
        <h1 id="startup-failure-title">애플리케이션을 시작하지 못했습니다</h1>
        <ErrorMessage>{message}</ErrorMessage>
        <p>
          배포 경로의 <code>/runtime-config.json</code>을 확인해 주세요.
        </p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          다시 불러오기
        </Button>
      </section>
    </main>
  );
}

export function StartupLoading() {
  return (
    <main className="startup-status">
      <Spinner className="size-8" label="애플리케이션 준비 중" />
    </main>
  );
}
