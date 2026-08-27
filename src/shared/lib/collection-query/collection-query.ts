export interface PageSlice<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly totalPages: number;
}

export function readPositivePage(value: string | null): number {
  if (value === null) return 1;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function readAllowedValue<T extends string>(
  value: string | null,
  allowedValues: readonly T[],
  fallback: T,
): T {
  return allowedValues.find((candidate) => candidate === value) ?? fallback;
}

/** 페이지 이동을 제외하고 같은 조회·정렬·필터 결과 집합인지 비교할 키를 만든다. */
export function createRecordSetSearchKey(params: URLSearchParams): string {
  const recordSetParams = new URLSearchParams(params);
  recordSetParams.delete('page');
  recordSetParams.sort();
  return recordSetParams.toString();
}

export function paginate<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number,
): PageSlice<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    totalPages,
  };
}
