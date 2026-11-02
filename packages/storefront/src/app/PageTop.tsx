import type { MouseEvent, ReactNode } from 'react';

import { PortfolioStrip } from './Portfolio.jsx';

/**
 * The top of the store's pages: the portfolio strip and the masthead with
 * the brand, and whatever the masthead holds once the store is ready. The
 * build puts the same markup into the page's own HTML, so it shows before
 * the script runs and nothing moves when the script takes over.
 */
export const PageTop = ({
    home,
    onHome,
    waiting = false,
    children,
}: {
    /** Where the brand leads, relative to the page. */
    readonly home: string;
    readonly onHome?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
    /**
     * Whether the masthead is waiting for the search box and the links the
     * store's page puts beside the brand, so it keeps the room they take and
     * nothing below it moves when they arrive.
     */
    readonly waiting?: boolean;
    readonly children?: ReactNode;
}) => (
    <>
        <PortfolioStrip />
        <header className={waiting ? 'masthead is-waiting' : 'masthead'}>
            <div className="masthead-row">
                <a className="brand" href={home} onClick={onHome}>
                    ShelfLens
                </a>
                {children}
            </div>
        </header>
    </>
);
