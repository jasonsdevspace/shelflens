import type { MouseEvent, ReactNode } from 'react';

import { Strip } from './Portfolio.jsx';

/**
 * The top of the store's pages: the portfolio strip, with the demo's own switches in a section of
 * their own at its end, and the masthead with the brand and whatever the masthead holds once the
 * store is ready. The switches are the demo's, not the store's, so they sit in the strip that says
 * whose demo it is, and the masthead is what a shopper uses. The build puts the same markup into
 * the page's own HTML, so it shows before the script runs and nothing moves when the script takes
 * over.
 */
export const PageTop = ({
    home,
    onHome,
    waiting = false,
    tools,
    children,
}: {
    /** The demo's own switches, in the strip's own section, once the store is ready. */
    readonly tools?: ReactNode;
    /** Where the brand leads, relative to the page. */
    readonly home: string;
    readonly onHome?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
    /**
     * Whether the masthead is waiting for the search box and the links the
     * store's page puts beside the brand, and the strip for the demo's
     * switches, so each keeps the room they take and nothing below it moves
     * when they arrive.
     */
    readonly waiting?: boolean;
    readonly children?: ReactNode;
}) => (
    <>
        {/* The strip draws the switches in a landmark of their own, named for them, so a screen
        reader finds them. While it only keeps their room, the section is unnamed, so no landmark
        is offered for it. */}
        <Strip tools={tools} toolsWaiting={waiting} />
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
