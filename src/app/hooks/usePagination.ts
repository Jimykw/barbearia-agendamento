import { useEffect, useMemo, useState } from "react";

export const DEFAULT_LIST_PAGE_SIZE = 10;

export function getVisiblePageNumbers(page: number, totalPages: number, radius = 1): number[] {
  const tp = Math.max(1, totalPages);
  const p = Math.min(Math.max(1, page), tp);
  const start = Math.max(1, p - radius);
  const end = Math.min(tp, p + radius);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

type UsePaginationOptions = {
  totalCount: number;
  pageSize?: number;
  /** Quando este valor muda, a página volta a 1 (ex.: filtros ou assinatura da lista). */
  resetDeps?: unknown;
};

/**
 * Estado de página para listas client-side (slice + números de página visíveis).
 */
export function usePagination({
  totalCount,
  pageSize = DEFAULT_LIST_PAGE_SIZE,
  resetDeps,
}: UsePaginationOptions) {
  const [page, setPage] = useState(1);
  const safeTotal = Math.max(0, totalCount);
  const totalPages = safeTotal === 0 ? 1 : Math.max(1, Math.ceil(safeTotal / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetDeps, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const sliceRange = useMemo(() => {
    const start = (page - 1) * pageSize;
    return { start, end: start + pageSize };
  }, [page, pageSize]);

  const visiblePages = useMemo(() => getVisiblePageNumbers(page, totalPages), [page, totalPages]);

  const showingCount = Math.min(pageSize, Math.max(0, safeTotal - sliceRange.start));

  return {
    page,
    setPage,
    pageSize,
    totalPages,
    visiblePages,
    sliceRange,
    showingCount,
  };
}
