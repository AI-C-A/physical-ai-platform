import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAsyncQuery } from './async-query';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject: (reason) => rejectPromise?.(reason),
    resolve: (value) => resolvePromise?.(value),
  };
}

describe('useAsyncQuery', () => {
  it('effect 직후 unmount하면 아직 시작하지 않은 load를 호출하지 않는다', async () => {
    const load = vi.fn(() => Promise.resolve('결과'));
    const { unmount } = renderHook(() => useAsyncQuery(load));

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(load).not.toHaveBeenCalled();
  });

  it('Strict Mode effect 재실행에서 폐기된 첫 세대 load를 중복 호출하지 않는다', async () => {
    const load = vi.fn(() => Promise.resolve('결과'));
    const { result } = renderHook(() => useAsyncQuery(load), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(load).toHaveBeenCalledOnce();
  });

  it('조회 실패를 노출하고 명시적 retry로 복구한다', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('일시적인 조회 실패'))
      .mockResolvedValueOnce('복구된 결과');
    const { result } = renderHook(() => useAsyncQuery(load));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({
      status: 'error',
      message: '일시적인 조회 실패',
    });

    act(() => result.current.retry());

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        data: '복구된 결과',
      }),
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('나중 요청이 먼저 끝나면 늦게 도착한 이전 결과를 버린다', async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAsyncQuery(load));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    act(() => result.current.retry());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    act(() => second.resolve('최신 결과'));
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        data: '최신 결과',
      }),
    );

    act(() => first.resolve('오래된 결과'));
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        data: '최신 결과',
      }),
    );
  });

  it('변경 알림으로 다시 조회하고 unmount에서 구독을 정리한다', async () => {
    let listener: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((nextListener: () => void) => {
      listener = nextListener;
      return unsubscribe;
    });
    const load = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const { result, unmount } = renderHook(() =>
      useAsyncQuery(load, subscribe),
    );

    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'ready', data: 1 }),
    );
    act(() => listener?.());
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'ready', data: 2 }),
    );

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('구독 시작 예외를 초기 query 오류로 노출하고 retry로 복구한다', async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi
      .fn<(listener: () => void) => () => void>()
      .mockImplementationOnce(() => {
        throw new Error('구독 시작 실패');
      })
      .mockReturnValueOnce(unsubscribe);
    const load = vi.fn(() => Promise.resolve('복구된 결과'));
    const { result, unmount } = renderHook(() => useAsyncQuery(load, subscribe));

    await waitFor(() => expect(result.current).toMatchObject({
      status: 'error',
      message: '구독 시작 실패',
      isRefreshing: false,
    }));
    expect(load).not.toHaveBeenCalled();

    act(() => result.current.retry());

    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: '복구된 결과',
      isRefreshing: false,
    }));
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledOnce();

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('같은 query의 재구독 예외는 마지막 성공 결과와 비차단 오류를 유지한다', async () => {
    const initialUnsubscribe = vi.fn();
    const subscribe = vi.fn(() => initialUnsubscribe);
    const failedSubscribe = vi.fn((): (() => void) => {
      throw new Error('재구독 실패');
    });
    const load = vi.fn(() => Promise.resolve('보존할 결과'));
    const initialProps: {
      readonly subscribeQuery: (listener: () => void) => () => void;
    } = { subscribeQuery: subscribe };
    const { result, rerender } = renderHook(
      ({ subscribeQuery }: {
        subscribeQuery: (listener: () => void) => () => void;
      }) => useAsyncQuery(load, subscribeQuery),
      { initialProps },
    );
    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: '보존할 결과',
    }));

    rerender({ subscribeQuery: failedSubscribe });

    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: '보존할 결과',
      isRefreshing: false,
      refreshError: '재구독 실패',
    }));
    expect(initialUnsubscribe).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
  });

  it('연속 변경 알림은 진행 중 조회 하나와 마지막 후속 조회로 합친다', async () => {
    let listener: (() => void) | undefined;
    const firstRefresh = createDeferred<number>();
    const trailingRefresh = createDeferred<number>();
    const load = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(trailingRefresh.promise);
    const subscribe = (nextListener: () => void) => {
      listener = nextListener;
      return () => undefined;
    };
    const { result } = renderHook(() => useAsyncQuery(load, subscribe));

    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: 1,
    }));
    act(() => listener?.());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    act(() => {
      listener?.();
      listener?.();
      listener?.();
    });
    expect(load).toHaveBeenCalledTimes(2);

    act(() => firstRefresh.resolve(2));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(result.current).toMatchObject({
      status: 'ready',
      data: 2,
      isRefreshing: true,
    });

    act(() => trailingRefresh.resolve(3));
    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: 3,
      isRefreshing: false,
    }));
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('초기 조회 중 invalidation 폭주도 동시 load 하나와 trailing 한 번만 실행한다', async () => {
    let listener: (() => void) | undefined;
    let activeLoads = 0;
    let maximumActiveLoads = 0;
    let loadSequence = 0;
    const initial = createDeferred<number>();
    const trailing = createDeferred<number>();
    const load = vi.fn<() => Promise<number>>(() => {
      activeLoads += 1;
      maximumActiveLoads = Math.max(maximumActiveLoads, activeLoads);
      const deferred = loadSequence === 0 ? initial : trailing;
      loadSequence += 1;
      return deferred.promise.finally(() => {
        activeLoads -= 1;
      });
    });
    const subscribe = (nextListener: () => void) => {
      listener = nextListener;
      return () => undefined;
    };
    const { result } = renderHook(() => useAsyncQuery(load, subscribe));

    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    act(() => {
      listener?.();
      listener?.();
      listener?.();
      listener?.();
    });

    expect(load).toHaveBeenCalledOnce();
    expect(maximumActiveLoads).toBe(1);

    act(() => initial.resolve(1));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(maximumActiveLoads).toBe(1);
    expect(result.current).toMatchObject({
      status: 'ready',
      data: 1,
      isRefreshing: true,
    });

    act(() => trailing.resolve(2));
    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: 2,
      isRefreshing: false,
    }));
    expect(load).toHaveBeenCalledTimes(2);
    expect(maximumActiveLoads).toBe(1);
  });

  it('trailing 조회가 예약된 경우 중간 실패를 노출하지 않고 마지막 실패만 표시한다', async () => {
    let listener: (() => void) | undefined;
    const firstRefresh = createDeferred<string>();
    const trailingRefresh = createDeferred<string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('보존할 결과')
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(trailingRefresh.promise);
    const subscribe = (nextListener: () => void) => {
      listener = nextListener;
      return () => undefined;
    };
    const { result } = renderHook(() => useAsyncQuery(load, subscribe));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => listener?.());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    act(() => listener?.());

    act(() => firstRefresh.reject(new Error('중간 실패')));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(result.current).toMatchObject({
      status: 'ready',
      data: '보존할 결과',
      isRefreshing: true,
      refreshError: null,
    });

    act(() => trailingRefresh.reject(new Error('마지막 실패')));
    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: '보존할 결과',
      isRefreshing: false,
      refreshError: '마지막 실패',
    }));
  });

  it('Query 조건 변경 중 마지막 결과를 유지해 입력 영역의 remount를 피한다', async () => {
    const second = createDeferred<string>();
    const firstLoad = vi.fn(() => Promise.resolve('첫 결과'));
    const secondLoad = vi.fn(() => second.promise);
    const { result, rerender } = renderHook(
      ({ load }) => useAsyncQuery(load, undefined, { retainPreviousData: true }),
      { initialProps: { load: firstLoad } },
    );

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        data: '첫 결과',
        isRefreshing: false,
      }),
    );
    rerender({ load: secondLoad });

    expect(result.current).toMatchObject({
      status: 'ready',
      data: '첫 결과',
      isRefreshing: true,
    });

    act(() => second.resolve('둘째 결과'));
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        data: '둘째 결과',
        isRefreshing: false,
      }),
    );
  });

  it('조건이 바뀐 첫 render부터 이전 결과를 ready로 오인하지 않는다', async () => {
    const second = createDeferred<string>();
    const { result, rerender } = renderHook(
      ({ load }) => useAsyncQuery(load),
      { initialProps: { load: () => Promise.resolve('첫 결과') } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ load: () => second.promise });

    expect(result.current.status).toBe('loading');
    act(() => second.resolve('둘째 결과'));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: '둘째 결과' }));
  });

  it('같은 query의 갱신 실패는 마지막 성공 결과와 입력 화면을 유지한다', async () => {
    let listener: (() => void) | undefined;
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('보존할 결과')
      .mockRejectedValueOnce(new Error('갱신 실패'));
    const subscribe = (nextListener: () => void) => {
      listener = nextListener;
      return () => undefined;
    };
    const { result } = renderHook(() => useAsyncQuery(
      load,
      subscribe,
    ));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: '보존할 결과' }));

    act(() => listener?.());

    await waitFor(() => expect(result.current.refreshError).toBe('갱신 실패'));
    expect(result.current).toMatchObject({
      status: 'ready',
      data: '보존할 결과',
      isRefreshing: false,
    });
  });

  it('retainPreviousData 조건 변경 실패를 stale ready와 비차단 오류로 끝낸다', async () => {
    const firstLoad = vi.fn(() => Promise.resolve('첫 결과'));
    const failedLoad = vi.fn(() => Promise.reject(new Error('둘째 조건 실패')));
    const { result, rerender } = renderHook(
      ({ load }) => useAsyncQuery(load, undefined, { retainPreviousData: true }),
      { initialProps: { load: firstLoad } },
    );
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: '첫 결과' }));

    rerender({ load: failedLoad });
    expect(result.current.isRefreshing).toBe(true);

    await waitFor(() => expect(result.current.refreshError).toBe('둘째 조건 실패'));
    expect(result.current).toMatchObject({
      status: 'ready',
      data: '첫 결과',
      isRefreshing: false,
    });
  });

  it('상세 대상 변경 중 invalidation 실패가 이전 대상 데이터를 새 query로 표시하지 않는다', async () => {
    const pendingTarget = createDeferred<string>();
    let listener: (() => void) | undefined;
    const subscribe = (nextListener: () => void) => {
      listener = nextListener;
      return () => undefined;
    };
    const firstLoad = vi.fn(() => Promise.resolve('대상 A'));
    const nextLoad = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(pendingTarget.promise)
      .mockRejectedValueOnce(new Error('대상 B 갱신 실패'));
    const { result, rerender } = renderHook(
      ({ load, queryKey }) => useAsyncQuery(load, subscribe, { queryKey }),
      { initialProps: { load: firstLoad, queryKey: 'A' } },
    );
    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: '대상 A',
    }));

    rerender({ load: nextLoad, queryKey: 'B' });
    await waitFor(() => expect(nextLoad).toHaveBeenCalledOnce());
    act(() => listener?.());

    expect(nextLoad).toHaveBeenCalledOnce();
    act(() => pendingTarget.reject(new Error('폐기할 대상 B 조회 실패')));

    await waitFor(() => expect(result.current).toMatchObject({
      status: 'error',
      message: '대상 B 갱신 실패',
    }));
    expect(result.current).not.toMatchObject({ data: '대상 A' });
  });

  it('이전 query의 갱신 오류를 새 대상의 첫 render에 노출하지 않는다', async () => {
    let listener: (() => void) | undefined;
    const nextTarget = createDeferred<string>();
    const nextLoad = vi.fn(() => nextTarget.promise);
    const firstLoad = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('대상 A')
      .mockRejectedValueOnce(new Error('대상 A 갱신 실패'));
    const subscribe = (nextListener: () => void) => {
      listener = nextListener;
      return () => undefined;
    };
    const renderSnapshots: { readonly queryKey: string; readonly refreshError: string | null }[] = [];
    const { result, rerender } = renderHook(
      ({ load, queryKey }) => {
        const state = useAsyncQuery(load, subscribe, { queryKey });
        renderSnapshots.push({ queryKey, refreshError: state.refreshError });
        return state;
      },
      { initialProps: { load: firstLoad, queryKey: 'A' } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => listener?.());
    await waitFor(() => expect(result.current.refreshError).toBe('대상 A 갱신 실패'));

    renderSnapshots.length = 0;
    rerender({ load: nextLoad, queryKey: 'B' });

    expect(renderSnapshots).not.toContainEqual({
      queryKey: 'B',
      refreshError: '대상 A 갱신 실패',
    });
    expect(result.current.refreshError).toBeNull();
  });

  it('queryKey 변경으로 폐기된 이전 성공과 실패는 새 세대를 덮지 않는다', async () => {
    const previous = createDeferred<string>();
    const current = createDeferred<string>();
    const firstLoad = vi.fn(() => previous.promise);
    const nextLoad = vi.fn(() => current.promise);
    const initialProps: {
      readonly load: () => Promise<string>;
      readonly queryKey: string;
    } = { load: firstLoad, queryKey: 'A' };
    const { result, rerender } = renderHook(
      ({ load, queryKey }: {
        load: () => Promise<string>;
        queryKey: string;
      }) => useAsyncQuery(load, undefined, { queryKey }),
      { initialProps },
    );

    await waitFor(() => expect(firstLoad).toHaveBeenCalledOnce());
    rerender({ load: nextLoad, queryKey: 'B' });
    await waitFor(() => expect(nextLoad).toHaveBeenCalledOnce());

    act(() => previous.resolve('폐기할 결과'));
    expect(result.current.status).toBe('loading');

    act(() => current.resolve('최신 결과'));
    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: '최신 결과',
    }));

    const failedPrevious = createDeferred<string>();
    const failedCurrent = createDeferred<string>();
    rerender({ load: () => failedPrevious.promise, queryKey: 'C' });
    await waitFor(() => expect(result.current.status).toBe('loading'));
    rerender({ load: () => failedCurrent.promise, queryKey: 'D' });

    act(() => failedPrevious.reject(new Error('폐기할 오류')));
    expect(result.current).not.toMatchObject({
      status: 'error',
      message: '폐기할 오류',
    });

    act(() => failedCurrent.resolve('최종 결과'));
    await waitFor(() => expect(result.current).toMatchObject({
      status: 'ready',
      data: '최종 결과',
    }));
  });

  it('unmount하면 pending 조회 완료가 trailing load나 상태 변경을 다시 시작하지 않는다', async () => {
    let listener: (() => void) | undefined;
    const pending = createDeferred<string>();
    const unsubscribe = vi.fn();
    const load = vi.fn(() => pending.promise);
    const subscribe = (nextListener: () => void) => {
      listener = nextListener;
      return unsubscribe;
    };
    const { unmount } = renderHook(() => useAsyncQuery(load, subscribe));

    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    act(() => listener?.());
    unmount();

    act(() => pending.resolve('폐기할 결과'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(load).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('query 교체와 unmount 중 구독 해제 예외를 격리한다', async () => {
    const firstUnsubscribe = vi.fn(() => {
      throw new Error('첫 query 구독 해제 실패');
    });
    const secondUnsubscribe = vi.fn(() => {
      throw new Error('둘째 query 구독 해제 실패');
    });
    const subscribe = vi
      .fn<(listener: () => void) => () => void>()
      .mockReturnValueOnce(firstUnsubscribe)
      .mockReturnValueOnce(secondUnsubscribe);
    const load = vi.fn(() => Promise.resolve('결과'));
    const { rerender, unmount } = renderHook(
      ({ queryKey }) => useAsyncQuery(load, subscribe, { queryKey }),
      { initialProps: { queryKey: 'A' } },
    );
    await waitFor(() => expect(subscribe).toHaveBeenCalledOnce());

    expect(() => rerender({ queryKey: 'B' })).not.toThrow();
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
    expect(firstUnsubscribe).toHaveBeenCalledOnce();

    expect(() => unmount()).not.toThrow();
    expect(secondUnsubscribe).toHaveBeenCalledOnce();
  });
});
