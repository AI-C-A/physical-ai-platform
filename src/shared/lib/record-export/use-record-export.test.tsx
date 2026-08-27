import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRecordExport } from './use-record-export';

function installDownloadSpies() {
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:test',
    });
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: () => undefined,
    });
  }
  return {
    click: vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined),
    createObjectUrl: vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:test'),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRecordExport', () => {
  it('내보내기 진행 중 중복 시작을 무시하고 파일을 한 번만 만든다', async () => {
    let resolveRecords: ((records: readonly { readonly id: string }[]) => void) | undefined;
    const loadRecords = vi.fn(
      () => new Promise<readonly { readonly id: string }[]>((resolve) => {
        resolveRecords = resolve;
      }),
    );
    const { click, createObjectUrl } = installDownloadSpies();
    const { result } = renderHook(() => useRecordExport());
    const options = {
      baseFileName: 'records',
      format: 'json' as const,
      loadRecords,
    };

    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.start(options);
      void result.current.start(options);
    });
    await waitFor(() => expect(loadRecords).toHaveBeenCalledOnce());
    expect(result.current.isExporting).toBe(true);

    await act(async () => {
      resolveRecords?.([{ id: 'record-1' }]);
      await first;
    });

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('조회 실패를 노출하고 부분 파일을 만들지 않는다', async () => {
    const loadRecords = vi.fn(() => Promise.reject(new Error('페이지 조회 실패')));
    const { click, createObjectUrl } = installDownloadSpies();
    const { result } = renderHook(() => useRecordExport());

    await act(() => result.current.start({
      baseFileName: 'records',
      format: 'csv',
      loadRecords,
    }));

    expect(result.current.error).toBe('내보내기에 실패했습니다. 페이지 조회 실패');
    expect(result.current.isExporting).toBe(false);
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('화면 이탈 뒤 늦게 끝난 조회는 파일을 내려받지 않는다', async () => {
    let resolveRecords: ((records: readonly { readonly id: string }[]) => void) | undefined;
    const loadRecords = vi.fn(
      () => new Promise<readonly { readonly id: string }[]>((resolve) => {
        resolveRecords = resolve;
      }),
    );
    const { click, createObjectUrl } = installDownloadSpies();
    const listeners = new Set<() => void>();
    const { result, unmount } = renderHook(() => useRecordExport());

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.start({
        baseFileName: 'records',
        format: 'json',
        loadRecords,
        subscribeInvalidation: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      });
    });
    await waitFor(() => expect(loadRecords).toHaveBeenCalledOnce());
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);

    await act(async () => {
      resolveRecords?.([{ id: 'late-record' }]);
      await exportPromise;
    });

    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('조회 중 repository invalidation이 발생하면 파일 생성을 중단한다', async () => {
    let resolveRecords: ((records: readonly { readonly id: string }[]) => void) | undefined;
    const listeners = new Set<() => void>();
    const loadRecords = vi.fn(
      () => new Promise<readonly { readonly id: string }[]>((resolve) => {
        resolveRecords = resolve;
      }),
    );
    const { click, createObjectUrl } = installDownloadSpies();
    const { result } = renderHook(() => useRecordExport());

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.start({
        baseFileName: 'records',
        format: 'json',
        loadRecords,
        subscribeInvalidation: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      });
    });
    await waitFor(() => expect(loadRecords).toHaveBeenCalledOnce());

    act(() => listeners.forEach((listener) => listener()));
    await act(async () => {
      resolveRecords?.([{ id: 'stale-record' }]);
      await exportPromise;
    });

    expect(result.current.error).toContain('결과 집합이 변경되었습니다');
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it('조회 중 화면의 결과 조건이 바뀌면 이전 조건의 파일 생성을 중단한다', async () => {
    let resolveRecords: ((records: readonly { readonly id: string }[]) => void) | undefined;
    let current = true;
    const loadRecords = vi.fn(
      () => new Promise<readonly { readonly id: string }[]>((resolve) => {
        resolveRecords = resolve;
      }),
    );
    const { click, createObjectUrl } = installDownloadSpies();
    const { result } = renderHook(() => useRecordExport());

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.start({
        baseFileName: 'records',
        format: 'json',
        isCurrent: () => current,
        loadRecords,
      });
    });
    await waitFor(() => expect(loadRecords).toHaveBeenCalledOnce());

    current = false;
    await act(async () => {
      resolveRecords?.([{ id: 'stale-filter-record' }]);
      await exportPromise;
    });

    expect(result.current.error).toContain('결과 집합이 변경되었습니다');
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('브라우저 download 실패를 오류로 노출한다', async () => {
    const { click } = installDownloadSpies();
    click.mockImplementation(() => {
      throw new Error('download blocked');
    });
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
    const { result } = renderHook(() => useRecordExport());

    await act(() => result.current.start({
      baseFileName: 'records',
      format: 'json',
      loadRecords: () => Promise.resolve([{ id: 'record-1' }]),
    }));

    expect(result.current.error).toBe('내보내기에 실패했습니다. download blocked');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test');
  });

  it('invalidation 구독 해제가 실패해도 완료 상태와 다음 내보내기를 복구한다', async () => {
    const { click, createObjectUrl } = installDownloadSpies();
    const unsubscribe = vi.fn(() => {
      throw new Error('구독 해제 실패');
    });
    const { result } = renderHook(() => useRecordExport());
    const options = {
      baseFileName: 'records',
      format: 'json' as const,
      loadRecords: () => Promise.resolve([{ id: 'record-1' }]),
      subscribeInvalidation: () => unsubscribe,
    };

    await act(() => result.current.start(options));
    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBeNull();

    await act(() => result.current.start(options));

    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(result.current.isExporting).toBe(false);
  });

  it('화면 이탈 중 invalidation 구독 해제가 실패해도 cleanup을 완료한다', async () => {
    let resolveRecords: ((records: readonly { readonly id: string }[]) => void) | undefined;
    const loadRecords = () => new Promise<readonly { readonly id: string }[]>((resolve) => {
      resolveRecords = resolve;
    });
    const unsubscribe = vi.fn(() => {
      throw new Error('구독 해제 실패');
    });
    const { click, createObjectUrl } = installDownloadSpies();
    const { result, unmount } = renderHook(() => useRecordExport());

    let exportPromise: Promise<void> | undefined;
    act(() => {
      exportPromise = result.current.start({
        baseFileName: 'records',
        format: 'json',
        loadRecords,
        subscribeInvalidation: () => unsubscribe,
      });
    });
    await waitFor(() => expect(resolveRecords).toBeDefined());

    expect(() => unmount()).not.toThrow();
    await act(async () => {
      resolveRecords?.([{ id: 'late-record' }]);
      await exportPromise;
    });

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
