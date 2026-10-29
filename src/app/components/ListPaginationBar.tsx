import { ChevronLeft, ChevronRight } from "lucide-react";

export type ListPaginationBarProps = {
  showingCount: number;
  totalCount: number;
  pageSize: number;
  page: number;
  totalPages: number;
  visiblePages: number[];
  onPageChange: (page: number) => void;
  /** Texto plural em minúsculas, ex.: "eventos", "agendamentos", "transações". */
  itemLabel: string;
  className?: string;
};

/**
 * Barra inferior padrão: "Mostrando X de Y … (N por página)" + seletor de páginas.
 */
export function ListPaginationBar({
  showingCount,
  totalCount,
  pageSize,
  page,
  totalPages,
  visiblePages,
  onPageChange,
  itemLabel,
  className = "",
}: ListPaginationBarProps) {
  if (totalCount <= 0) return null;

  return (
    <div
      className={`mt-4 flex flex-col items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/30 px-4 py-3 sm:flex-row ${className}`.trim()}
    >
      <div className="text-xs text-muted-foreground">
        Mostrando {showingCount} de {totalCount} {itemLabel} ({pageSize} por página)
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {visiblePages.map((p) => (
            <button
              key={`list-page-${p}`}
              type="button"
              onClick={() => onPageChange(p)}
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${
                p === page
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border/70 bg-background/70 text-muted-foreground hover:border-accent/50 hover:text-accent"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
