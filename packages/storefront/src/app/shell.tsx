import { renderToStaticMarkup } from 'react-dom/server';

import { PageTop } from './PageTop.jsx';
import { Preparing } from './Preparing.jsx';

/**
 * The first screen of each page the store's script draws, as the script
 * first draws it, for the build to put in the page's HTML. The strip and
 * the brand show before the script runs, and when it runs it draws the
 * same thing again, so nothing moves. Only a browser with JavaScript
 * turned off sees the line that says so.
 */
const PAGES: Readonly<Record<string, { readonly home: string; readonly main: string }>> = {
    '/index.html': { home: './', main: 'content' },
    '/try/index.html': { home: '../', main: 'content try' },
};

export const NO_SCRIPT =
    '<noscript><p class="notice">ShelfLens needs JavaScript. Turn it on in this browser and reload the page.</p></noscript>';

/** The page's first screen, without the line for a browser with JavaScript turned off. */
export const firstScreen = (page: string): string => {
    const shell = PAGES[page];
    if (!shell) throw new Error(`no first screen is written for ${page}`);
    return renderToStaticMarkup(
        <>
            <PageTop home={shell.home} />
            <main className={shell.main}>
                <Preparing />
            </main>
        </>
    );
};

/** The page's first screen as the HTML carries it. */
export const shellFor = (page: string): string =>
    firstScreen(page).replace('</main>', () => `${NO_SCRIPT}</main>`);
