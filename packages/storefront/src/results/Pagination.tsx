/**
 * Pages of results.
 *
 * Previous, next and a window of page numbers, with the current one marked
 * for assistive technology. The page lives in the URL, so each step is a
 * history entry and the back button walks back through them.
 */

export interface PaginationProps {
    readonly page: number;
    readonly totalPages: number;
    readonly onPage: (page: number) => void;
}

/** Up to this many page numbers, centered on the current page. */
const WINDOW = 5;

const windowOf = (page: number, totalPages: number): number[] => {
    const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1));
    const end = Math.min(totalPages, start + WINDOW - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

export const Pagination = ({ page, totalPages, onPage }: PaginationProps) => {
    if (totalPages <= 1) return null;
    return (
        <nav className="pagination" aria-label="Pages">
            <button
                type="button"
                className="page-step"
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
            >
                Previous
            </button>
            <ul className="page-list">
                {windowOf(page, totalPages).map((number) => (
                    <li key={number}>
                        <button
                            type="button"
                            className="page-number"
                            aria-current={number === page ? 'page' : undefined}
                            aria-label={`Page ${number}`}
                            onClick={() => onPage(number)}
                        >
                            {number}
                        </button>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                className="page-step"
                disabled={page >= totalPages}
                onClick={() => onPage(page + 1)}
            >
                Next
            </button>
            <span className="page-status">
                Page {page} of {totalPages}
            </span>
        </nav>
    );
};
