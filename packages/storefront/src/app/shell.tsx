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

/** The line for a browser with JavaScript turned off, about the thing that needs it. */
const noScript = (what: string) =>
    `<noscript><p class="notice">${what} needs JavaScript. Turn it on in this browser and reload the page.</p></noscript>`;

export const NO_SCRIPT = noScript('ShelfLens');

/**
 * What the widget pages show where the search box goes, until the box
 * covers it. The loading line shows only after a moment, as the store's
 * does, and a browser with JavaScript turned off sees the other line
 * instead, since the style in the head hides the first.
 */
export const WIDGET_WAITING = `<p class="notice widget-waiting" role="status">Loading the search box.</p>${noScript('The search box')}`;
export const WIDGET_NO_SCRIPT_STYLE =
    '<noscript><style>.widget-waiting { display: none; }</style></noscript>';

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
