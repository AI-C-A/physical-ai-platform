import { describe, expect, it, vi } from 'vitest';

import { collectAllPages, createPageResult } from './query';

describe('createPageResult', () => {
  it('범위를 벗어난 요청 페이지를 마지막 유효 페이지로 제한한다', () => {
    const source = Array.from({ length: 21 }, (_, index) => index + 1);

    expect(createPageResult(source, { page: 999, pageSize: 20 })).toEqual({
      items: [21],
      page: 2,
      pageSize: 20,
      totalItems: 21,
      totalPages: 2,
    });
  });

  it('빈 결과도 1페이지의 정상 Empty로 유지한다', () => {
    expect(createPageResult([], { page: 999, pageSize: 20 })).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 1,
    });
  });
});

describe('collectAllPages', () => {
  it('Port가 보고한 모든 페이지를 같은 조건으로 수집한다', async () => {
    const source = ['one', 'two', 'three', 'four', 'five'];
    const loadPage = vi.fn((query: { readonly page: number; readonly pageSize: number; readonly search: string }) =>
      Promise.resolve(createPageResult(source, query)));

    await expect(collectAllPages(
      { page: 3, pageSize: 2, search: 'same-query' },
      loadPage,
      { getKey: (item) => item },
    )).resolves.toEqual(source);
    expect(loadPage).toHaveBeenCalledTimes(3);
    expect(loadPage.mock.calls.map(([query]) => query)).toEqual([
      { page: 1, pageSize: 2, search: 'same-query' },
      { page: 2, pageSize: 2, search: 'same-query' },
      { page: 3, pageSize: 2, search: 'same-query' },
    ]);
  });

  it('페이지 사이에 결과 집합이 바뀌면 불완전한 내보내기를 거부한다', async () => {
    await expect(collectAllPages(
      { page: 1, pageSize: 1 },
      ({ page, pageSize }) => Promise.resolve({
        items: [page],
        page,
        pageSize,
        totalItems: page === 1 ? 2 : 3,
        totalPages: page === 1 ? 2 : 3,
      }),
      { getKey: String },
    )).rejects.toThrow('결과 집합이 변경되었습니다');
  });

  it('보고된 전체 개수와 수집한 개수가 다르면 내보내기를 거부한다', async () => {
    await expect(collectAllPages(
      { page: 1, pageSize: 20 },
      ({ page, pageSize }) => Promise.resolve({
        items: ['one'],
        page,
        pageSize,
        totalItems: 2,
        totalPages: 1,
      }),
      { getKey: (item) => item },
    )).rejects.toThrow('페이지 응답이 올바르지 않아');
  });

  it('페이지별 항목 수를 바꿔 전체 개수만 맞춘 응답을 거부한다', async () => {
    const pages = {
      1: ['one', 'two'],
      2: ['three'],
      3: ['four', 'five'],
    } as const;
    const loadPage = vi.fn(({ page, pageSize }: {
      readonly page: number;
      readonly pageSize: number;
    }) => Promise.resolve({
      items: pages[page as keyof typeof pages],
      page,
      pageSize,
      totalItems: 5,
      totalPages: 3,
    }));

    await expect(collectAllPages(
      { page: 1, pageSize: 2 },
      loadPage,
      { getKey: (item) => item },
    )).rejects.toThrow('결과 집합이 변경되었습니다');
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: '요청과 다른 pageSize',
      response: { pageSize: 10, totalItems: 1, totalPages: 1 },
    },
    {
      label: '전체 개수와 맞지 않는 totalPages',
      response: { pageSize: 20, totalItems: 21, totalPages: 1 },
    },
  ])('$label 응답을 전체 export 전에 거부한다', async ({ response }) => {
    const loadPage = vi.fn(({ page }: { readonly page: number; readonly pageSize: number }) =>
      Promise.resolve({
        items: [{ id: 'one' }],
        page,
        ...response,
      }));

    await expect(collectAllPages(
      { page: 1, pageSize: 20 },
      loadPage,
      { getKey: (item) => item.id },
    )).rejects.toThrow('페이지 응답이 올바르지 않아');
    expect(loadPage).toHaveBeenCalledOnce();
  });

  it('페이지가 바뀔 때 같은 식별자가 반복되면 누락 가능성이 있어 거부한다', async () => {
    await expect(collectAllPages(
      { page: 1, pageSize: 1 },
      ({ page, pageSize }) => Promise.resolve({
        items: [{ id: 'same', page }],
        page,
        pageSize,
        totalItems: 2,
        totalPages: 2,
      }),
      { getKey: (item) => item.id },
    )).rejects.toThrow('중복되거나 비어 있는 식별자');
  });

  it('공백뿐인 식별자를 유효한 export key로 사용하지 않는다', async () => {
    await expect(collectAllPages(
      { page: 1, pageSize: 20 },
      ({ page, pageSize }) => Promise.resolve({
        items: [{ id: '   ' }],
        page,
        pageSize,
        totalItems: 1,
        totalPages: 1,
      }),
      { getKey: (item) => item.id },
    )).rejects.toThrow('중복되거나 비어 있는 식별자');
  });

  it('조회 중 invalidation이 발생하면 부분 결과를 거부한다', async () => {
    let current = true;
    await expect(collectAllPages(
      { page: 1, pageSize: 1 },
      ({ page, pageSize }) => {
        if (page === 1) current = false;
        return Promise.resolve({
          items: [{ id: `item-${String(page)}` }],
          page,
          pageSize,
          totalItems: 2,
          totalPages: 2,
        });
      },
      { getKey: (item) => item.id, isCurrent: () => current },
    )).rejects.toThrow('결과 집합이 변경되었습니다');
  });
});
