import { useLayoutEffect, useRef } from 'react';

function collectionLevel(pathname: string): 'list' | 'session' | null {
  if (
    pathname === '/mlops/collection'
    || pathname === '/mlops/collection/new'
    || /^\/mlops\/collection\/[^/]+\/setup$/u.test(pathname)
  ) return 'list';
  // 시뮬레이션 수집 화면은 콘솔과 같은 층이라 콘솔과 오갈 때는 전환 방향을 주지 않는다.
  return /^\/mlops\/collection\/[^/]+(?:\/simulation)?$/u.test(pathname) ? 'session' : null;
}

/** 모달 경로는 목록과 같은 층으로 취급하고 수집 콘솔 진입·복귀에만 방향을 부여한다. */
export function useCollectionPageTransition(pathname: string): void {
  const previousPathnameRef = useRef(pathname);

  useLayoutEffect(() => {
    const previous = collectionLevel(previousPathnameRef.current);
    const next = collectionLevel(pathname);
    previousPathnameRef.current = pathname;
    if (previous === null || next === null || previous === next) return;

    const root = document.documentElement;
    root.dataset.collectionPageTransition = next === 'session' ? 'open' : 'close';
    let active = true;
    const clear = () => {
      if (active) delete root.dataset.collectionPageTransition;
    };
    const transition = document.activeViewTransition;
    // finished가 없는 브라우저에서도 다음 탐색에 전환 스타일이 남지 않게 한다.
    const timer = transition == null ? window.setTimeout(clear, 1_000) : null;
    void transition?.finished.then(clear, clear);

    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      delete root.dataset.collectionPageTransition;
    };
  }, [pathname]);
}
