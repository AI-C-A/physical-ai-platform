import { Button } from '@/shared/ui/button';

interface PaginationProps {
  readonly isPending?: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly onPageChange: (page: number) => void;
}

export function Pagination({
  isPending = false,
  page,
  pageSize,
  totalItems,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <nav aria-label="페이지 이동" className="flex flex-wrap items-center justify-between gap-3">
      <span aria-atomic="true" className="text-sm text-neutral-600" role="status">
        {String(page)} / {String(totalPages)} 페이지 · 총 {String(totalItems)}건
      </span>
      <div className="flex gap-2">
        <Button
          aria-disabled={isPending || page <= 1}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => {
            if (!isPending) onPageChange(page - 1);
          }}
          variant="secondary"
        >
          이전
        </Button>
        <Button
          aria-disabled={isPending || page >= totalPages}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={() => {
            if (!isPending) onPageChange(page + 1);
          }}
          variant="secondary"
        >
          다음
        </Button>
      </div>
    </nav>
  );
}
