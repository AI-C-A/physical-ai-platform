export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface PageResult<T> extends PageRequest {
  readonly items: readonly T[];
  readonly totalItems: number;
  readonly totalPages: number;
}

interface CollectAllPagesOptions<TItem> {
  readonly getKey: (item: TItem) => string;
  readonly isCurrent?: () => boolean;
}

export function createPageResult<T>(
  items: readonly T[],
  request: PageRequest,
): PageResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / request.pageSize));
  const page = Math.min(Math.max(1, request.page), totalPages);
  return {
    items: items.slice((page - 1) * request.pageSize, page * request.pageSize),
    page,
    pageSize: request.pageSize,
    totalItems: items.length,
    totalPages,
  };
}

export async function collectAllPages<TItem, TQuery extends PageRequest>(
  query: TQuery,
  loadPage: (query: TQuery) => Promise<PageResult<TItem>>,
  options: CollectAllPagesOptions<TItem>,
): Promise<readonly TItem[]> {
  const assertCurrent = (): void => {
    if (options.isCurrent?.() === false) {
      throw new Error('내보내는 동안 결과 집합이 변경되었습니다. 잠시 후 다시 시도하세요.');
    }
  };
  assertCurrent();
  const first = await loadPage({ ...query, page: 1 });
  assertCurrent();
  const expectedTotalPages = Number.isInteger(first.pageSize)
    && first.pageSize > 0
    && Number.isInteger(first.totalItems)
    && first.totalItems >= 0
    ? Math.max(1, Math.ceil(first.totalItems / first.pageSize))
    : null;
  const expectedFirstPageItems = expectedTotalPages === null
    ? null
    : first.totalPages === 1
      ? first.totalItems
      : first.pageSize;
  if (
    first.page !== 1
    || first.pageSize !== query.pageSize
    || !Number.isInteger(first.pageSize)
    || first.pageSize <= 0
    || !Number.isInteger(first.totalItems)
    || first.totalItems < 0
    || !Number.isInteger(first.totalPages)
    || first.totalPages < 1
    || first.totalPages !== expectedTotalPages
    || first.items.length !== expectedFirstPageItems
  ) {
    throw new Error('페이지 응답이 올바르지 않아 전체 결과를 내보낼 수 없습니다.');
  }

  const items = [...first.items];
  const keys = new Set<string>();
  const appendKeys = (pageItems: readonly TItem[]): void => {
    pageItems.forEach((item) => {
      const key = options.getKey(item);
      if (key.trim().length === 0 || keys.has(key)) {
        throw new Error('내보내는 동안 중복되거나 비어 있는 식별자를 확인해 중단했습니다.');
      }
      keys.add(key);
    });
  };
  appendKeys(first.items);
  for (let page = 2; page <= first.totalPages; page += 1) {
    assertCurrent();
    const result = await loadPage({ ...query, page });
    assertCurrent();
    if (
      result.page !== page
      || result.pageSize !== first.pageSize
      || result.totalItems !== first.totalItems
      || result.totalPages !== first.totalPages
      || result.items.length !== (
        page === first.totalPages
          ? first.totalItems - first.pageSize * (first.totalPages - 1)
          : first.pageSize
      )
    ) {
      throw new Error('내보내는 동안 결과 집합이 변경되었습니다. 잠시 후 다시 시도하세요.');
    }
    appendKeys(result.items);
    items.push(...result.items);
  }

  assertCurrent();
  if (items.length !== first.totalItems) {
    throw new Error('전체 결과를 확인하지 못해 내보내기를 중단했습니다.');
  }
  return items;
}
