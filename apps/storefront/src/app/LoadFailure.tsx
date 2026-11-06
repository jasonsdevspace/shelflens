import { Button, Callout } from '@jasonsdevspace/design-kit/react';
import type { ReactNode } from 'react';

/**
 * What a page says when what it asked the store for did not arrive, in the
 * design kit's callout for something that went wrong: what failed, what to
 * do, and a button that asks again. The reason itself is for a developer,
 * so it is shown only in development, outside the callout. Only the message
 * is the alert, so the buttons below it are not read as part of it.
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
    <>
        <Callout
            tone="danger"
            {...(announce ? { live: 'alert' as const } : {})}
            actions={
                <>
                    <Button onClick={onRetry}>Try again</Button>
                    {children}
                </>
            }
        >
            <p>
                {what} could not be loaded. Try again, and if it keeps happening, reload the page.
            </p>
        </Callout>
        {/* Outside the callout, so a developer's reason is never read as part of the alert. */}
        {import.meta.env.DEV && <p className="notice">{reason}</p>}
    </>
);
