import { useEffect, useRef } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { Button } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';

function getErrorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`.trim();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '알 수 없는 화면 오류가 발생했습니다.';
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section aria-labelledby="route-error-title" className="space-y-4">
        <p className="text-sm font-semibold text-red-700">화면 오류</p>
        <h1
          className="text-2xl font-bold"
          id="route-error-title"
          ref={titleRef}
          tabIndex={-1}
        >
          요청한 화면을 표시하지 못했습니다
        </h1>
        <ErrorMessage className="text-neutral-700">
          {getErrorMessage(error)}
        </ErrorMessage>
        <Button onClick={() => window.location.reload()}>화면 다시 불러오기</Button>
      </section>
    </main>
  );
}
