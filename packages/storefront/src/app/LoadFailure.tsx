import type { ReactNode } from 'react';

/**
 * What a page says when what it asked the store for did not arrive: what
 * failed, what to do, and a button that asks again. The reason itself is
 * for a developer, so it is shown only in development.
 */
export const LoadFailure = ({
    what,
    reason,
    onRetry,
    children,
}: {
    /** What could not be loaded, as the start of a sentence, such as "The products". */
    readonly what: string;
    readonly reason: string;
    readonly onRetry: () => void;
    /** Another way on, beside trying again. */
    readonly children?: ReactNode;
}) => (
    <div className="notice load-failure" role="alert">
        <p>{what} could not be loaded. Try again, and if it keeps happening, reload the page.</p>
        {import.meta.env.DEV && <p>{reason}</p>}
        <div className="load-failure-actions">
            <button type="button" className="standby-retry" onClick={onRetry}>
                Try again
            </button>
            {children}
        </div>
    </div>
);
