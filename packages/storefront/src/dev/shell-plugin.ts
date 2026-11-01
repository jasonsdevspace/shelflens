import { fileURLToPath } from 'node:url';

import { type Plugin, runnerImport } from 'vite';

/**
 * Puts each page's first screen into the page at build time, from the same
 * components and copy the script uses. The store's pages get the portfolio
 * strip, the brand and an empty content area in their root element, and
 * the script draws the same markup over them. The widget pages get a
 * loading line where the search box goes.
 */
const ROOT = '<div id="root"><!-- page-shell --></div>';
/** Where a widget page mounts the search box, which also marks it as a widget page. */
export const WIDGET = '<div id="shelflens-search"><!-- widget-waiting --></div>';
const HEAD_END = '</head>';
const SHELL = fileURLToPath(new URL('../app/shell.tsx', import.meta.url));

type Shell = typeof import('../app/shell.jsx');

export const pageShell = (): Plugin => {
    let base = '/';
    let building = false;
    let built: Promise<Shell> | undefined;
    // Loaded through Vite, so the components see the site's base as they do in the page.
    const load = () =>
        runnerImport<Shell>(SHELL, { configFile: false, base, logLevel: 'silent' }).then(
            ({ module }) => module
        );
    // Once for a build. Afresh for each page the dev server sends, so an edit shows.
    const shell = () => (building ? (built ??= load()) : load());
    return {
        name: 'shelflens-page-shell',
        configResolved: (config) => {
            base = config.base;
            building = config.command === 'build';
        },
        transformIndexHtml: {
            order: 'pre',
            handler: async (html, { path }) => {
                if (html.includes(ROOT)) {
                    const markup = (await shell()).shellFor(path);
                    return html.replace(ROOT, () => `<div id="root">${markup}</div>`);
                }
                if (html.includes(WIDGET)) {
                    const { WIDGET_WAITING, WIDGET_NO_SCRIPT_STYLE } = await shell();
                    return html
                        .replace(WIDGET, () => `<div id="shelflens-search">${WIDGET_WAITING}</div>`)
                        .replace(HEAD_END, () => `${WIDGET_NO_SCRIPT_STYLE}${HEAD_END}`);
                }
                return html;
            },
        },
    };
};
