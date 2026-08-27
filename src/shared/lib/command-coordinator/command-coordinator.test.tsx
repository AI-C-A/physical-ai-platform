import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCoordinatedCommand } from './command-coordinator';

describe('useCoordinatedCommand', () => {
  it('같은 scope와 key의 실행을 remount 사이에 공유하고 성공 확인 전 중복 실행을 막는다', async () => {
    const scope = {};
    let resolveOperation: ((value: number) => void) | undefined;
    const operation = vi.fn(
      () => new Promise<number>((resolve) => {
        resolveOperation = resolve;
      }),
    );
    const duplicateOperation = vi.fn(() => Promise.resolve(2));
    const first = renderHook(() => useCoordinatedCommand<number>(scope, 'create'));

    let firstPromise: Promise<number> | undefined;
    await act(async () => {
      firstPromise = first.result.current.execute(undefined, operation);
      await Promise.resolve();
    });
    expect(first.result.current.snapshot.status).toBe('pending');
    expect(operation).toHaveBeenCalledOnce();
    first.unmount();

    const second = renderHook(() => useCoordinatedCommand<number>(scope, 'create'));
    expect(second.result.current.snapshot.status).toBe('pending');
    let duplicatePromise: Promise<number> | undefined;
    act(() => {
      duplicatePromise = second.result.current.execute(undefined, duplicateOperation);
    });
    expect(duplicatePromise).toBe(firstPromise);
    expect(duplicateOperation).not.toHaveBeenCalled();

    await act(async () => {
      resolveOperation?.(1);
      await firstPromise;
    });
    expect(second.result.current.snapshot).toEqual(expect.objectContaining({
      status: 'success',
      result: 1,
    }));

    act(() => second.result.current.reset());
    expect(second.result.current.snapshot).toEqual(expect.objectContaining({
      status: 'idle',
      lastSuccess: null,
    }));
  });

  it('같은 scope에서도 서로 다른 operation key는 독립 실행한다', async () => {
    const scope = {};
    const first = renderHook(() => useCoordinatedCommand<number>(scope, 'update:one'));
    const second = renderHook(() => useCoordinatedCommand<number>(scope, 'update:two'));
    const firstOperation = vi.fn(() => new Promise<number>(() => undefined));
    const secondOperation = vi.fn(() => new Promise<number>(() => undefined));

    await act(async () => {
      void first.result.current.execute(undefined, firstOperation);
      void second.result.current.execute(undefined, secondOperation);
      await Promise.resolve();
    });

    expect(firstOperation).toHaveBeenCalledOnce();
    expect(secondOperation).toHaveBeenCalledOnce();
    expect(first.result.current.snapshot.status).toBe('pending');
    expect(second.result.current.snapshot.status).toBe('pending');
  });

  it('구독자가 없는 동안 완료된 terminal 결과를 다음 mount가 인수해 reset한다', async () => {
    const scope = {};
    let resolveOperation: ((value: number) => void) | undefined;
    const operation = () => new Promise<number>((resolve) => {
      resolveOperation = resolve;
    });
    const first = renderHook(() => useCoordinatedCommand<number>(scope, 'update:one'));
    let promise: Promise<number> | undefined;

    await act(async () => {
      promise = first.result.current.execute(undefined, operation);
      await Promise.resolve();
    });
    first.unmount();

    await act(async () => {
      resolveOperation?.(1);
      await promise;
    });

    const remounted = renderHook(() => useCoordinatedCommand<number>(scope, 'update:one'));
    expect(remounted.result.current.snapshot).toEqual(expect.objectContaining({
      status: 'success',
      result: 1,
    }));
    act(() => remounted.result.current.reset());
    expect(remounted.result.current.snapshot).toEqual(expect.objectContaining({
      status: 'idle',
      lastSuccess: null,
    }));
  });

  it('재마운트 뒤 실패해도 제출 입력을 보존하고 새 입력으로 재시도한다', async () => {
    const scope = {};
    let rejectOperation: ((reason: Error) => void) | undefined;
    const first = renderHook(() => useCoordinatedCommand<
      number,
      { readonly name: string }
    >(scope, 'update:input'));
    let promise: Promise<number> | undefined;

    await act(async () => {
      promise = first.result.current.execute(
        { name: '보존할 입력' },
        () => new Promise<number>((_resolve, reject) => {
          rejectOperation = reject;
        }),
      );
      await Promise.resolve();
    });
    first.unmount();

    await act(async () => {
      rejectOperation?.(new Error('저장 실패'));
      await promise?.catch(() => undefined);
    });

    const remounted = renderHook(() => useCoordinatedCommand<
      number,
      { readonly name: string }
    >(scope, 'update:input'));
    expect(remounted.result.current.snapshot).toEqual(expect.objectContaining({
      status: 'error',
      message: '저장 실패',
      submittedInput: { name: '보존할 입력' },
    }));

    await act(async () => {
      await remounted.result.current.execute(
        { name: '수정한 입력' },
        () => Promise.resolve(8),
      );
    });
    expect(remounted.result.current.snapshot).toEqual(expect.objectContaining({
      status: 'success',
      result: 8,
    }));
  });

  it('명시한 update 조정 경로만 success 결과를 idle 상태에 보존한다', async () => {
    const scope = {};
    const current = renderHook(() => useCoordinatedCommand<number>(scope, 'update:one'));

    await act(async () => {
      await current.result.current.execute(undefined, () => Promise.resolve(7));
    });
    act(() => current.result.current.reset({ retainSuccess: true }));

    const retainedSnapshot = current.result.current.snapshot;
    expect(retainedSnapshot.status).toBe('idle');
    if (retainedSnapshot.status !== 'idle') throw new Error('idle 상태가 필요합니다.');
    expect(retainedSnapshot.lastSuccess?.result).toBe(7);
    act(() => current.result.current.clearLastSuccess());
    expect(current.result.current.snapshot).toEqual(expect.objectContaining({
      status: 'idle',
      lastSuccess: null,
    }));
  });

  it('소비되지 않은 terminal 결과를 scope별 최근 32개로 제한한다', async () => {
    const scope = {};

    for (let index = 0; index < 33; index += 1) {
      const current = renderHook(() => useCoordinatedCommand<number>(scope, `update:${String(index)}`));
      let resolveOperation: ((value: number) => void) | undefined;
      let promise: Promise<number> | undefined;
      await act(async () => {
        promise = current.result.current.execute(undefined, () => new Promise<number>((resolve) => {
          resolveOperation = resolve;
        }));
        await Promise.resolve();
      });
      current.unmount();
      await act(async () => {
        resolveOperation?.(index);
        await promise;
      });
    }

    const oldest = renderHook(() => useCoordinatedCommand<number>(scope, 'update:0'));
    const newest = renderHook(() => useCoordinatedCommand<number>(scope, 'update:32'));
    expect(oldest.result.current.snapshot.status).toBe('idle');
    expect(newest.result.current.snapshot).toEqual(expect.objectContaining({
      status: 'success',
      result: 32,
    }));
  });
});
