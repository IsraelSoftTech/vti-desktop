import "./Pagination.css";

export const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const;

type Props = {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export default function Pagination({
  page,
  pageSize,
  total,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const pages = totalPages(total, pageSize);
  const safePage = Math.min(page, pages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div className="pagination">
      <div className="pagination__size">
        <label className="pagination__label" htmlFor="page-size">
          Rows per page
        </label>
        <select
          id="page-size"
          className="pagination__select"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <p className="pagination__info">
        {total === 0 ? "No rows" : `${start}–${end} of ${total}`}
      </p>

      <div className="pagination__nav">
        <button
          type="button"
          className="pagination__btn"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          aria-label="First page"
        >
          «
        </button>
        <button
          type="button"
          className="pagination__btn"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        <span className="pagination__page">
          Page {safePage} / {pages}
        </span>
        <button
          type="button"
          className="pagination__btn"
          disabled={safePage >= pages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          type="button"
          className="pagination__btn"
          disabled={safePage >= pages}
          onClick={() => onPageChange(pages)}
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}
