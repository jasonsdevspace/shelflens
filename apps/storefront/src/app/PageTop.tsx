import type { MouseEvent, ReactNode } from 'react';

import { PortfolioStrip } from './Portfolio.jsx';

/**
 * The top of the store's pages: the portfolio strip, with the demo's own
 * switches beside it, and the masthead with the brand and whatever the
 * masthead holds once the store is ready. The switches are the demo's, not
 * the store's, so they sit with the strip that says whose demo it is, and
 * the masthead is what a shopper uses. The build puts the same markup into
 * the page's own HTML, so it shows before the script runs and nothing moves
 * when the script takes over.
 */
export const PageTop = ({
    home,
    onHome,
    waiting = false,
    tools,
    children,
}: {
    /** The demo's own switches, beside the strip, once the store is ready. */
    readonly tools?: ReactNode;
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
        <div className={waiting ? 'topbar is-waiting' : 'topbar'}>
            <PortfolioStrip />
            {/* A landmark of its own once it holds the switches, named for them, so a screen reader
            finds them, and no landmark while it only keeps their room. */}
            <section className="topbar-tools" aria-label={tools ? 'Demo' : undefined}>
                {tools}
            </section>
        </div>
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
