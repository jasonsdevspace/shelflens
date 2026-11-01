import type { ReactNode } from 'react';

/**
 * What a page says when what it asked the store for did not arrive: what
 * failed, what to do, and a button that asks again. The reason itself is
 * for a developer, so it is shown only in development. Only the message
 * is the alert, so the buttons beside it are not read as part of it.
 */
export const LoadFailure = ({
    what,
    reason,
    onRetry,
    announce = true,
    children,
}: {
    /** What could not be loaded, as the start of a sentence, such as "The products". */
    readonly what: string;
    readonly reason: string;
    readonly onRetry: () => void;
    /** Whether the message is announced. Off where focus moves to it, which reads it already. */
    readonly announce?: boolean;
    /** Another way on, beside trying again. */
    readonly children?: ReactNode;
}) => (
    <div className="notice load-failure">
        <p role={announce ? 'alert' : undefined}>
            {what} could not be loaded. Try again, and if it keeps happening, reload the page.
        </p>
        {import.meta.env.DEV && <p>{reason}</p>}
        <div className="load-failure-actions">
            <button type="button" className="standby-retry" onClick={onRetry}>
                Try again
            </button>
            {children}
        </div>
    </div>
);
