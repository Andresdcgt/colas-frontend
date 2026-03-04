import { AngleLeftIcon, AngleRightIcon } from "../../../icons";

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

export interface PaginationProps {
  /** Página actual (1-based) */
  page: number;
  /** Total de ítems */
  totalItems: number;
  /** Ítems por página */
  pageSize: number;
  /** Cambio de página */
  onPageChange: (page: number) => void;
  /** Cambio de tamaño de página (opcional) */
  onPageSizeChange?: (pageSize: number) => void;
  /** Clase adicional para el contenedor */
  className?: string;
}

export function Pagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className = "",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  if (totalItems === 0) return null;

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const getPageNumbers = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "ellipsis")[] = [];
    if (page <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push("ellipsis");
      pages.push(totalPages);
    } else if (page >= totalPages - 3) {
      pages.push(1);
      pages.push("ellipsis");
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push("ellipsis");
      for (let i = page - 1; i <= page + 1; i++) pages.push(i);
      pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Mostrando <span className="font-medium text-gray-900 dark:text-white">{start}</span> a{" "}
          <span className="font-medium text-gray-900 dark:text-white">{end}</span> de{" "}
          <span className="font-medium text-gray-900 dark:text-white">{totalItems}</span> resultados
        </p>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="page-size" className="text-sm text-gray-600 dark:text-gray-400">
              Por página
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Página anterior"
        >
          <AngleLeftIcon className="h-4 w-4" />
        </button>
        <nav className="flex items-center gap-1" aria-label="Paginación">
          {getPageNumbers().map((p, i) =>
            p === "ellipsis" ? (
              <span key={`ell-${i}`} className="px-2 text-gray-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`h-9 min-w-[2.25rem] rounded-lg px-2 text-sm font-medium transition-colors ${
                  p === page
                    ? "bg-brand-500 text-white dark:bg-brand-600"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {p}
              </button>
            )
          )}
        </nav>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Página siguiente"
        >
          <AngleRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
