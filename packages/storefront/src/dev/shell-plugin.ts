import { fileURLToPath } from 'node:url';

import { type Plugin, runnerImport } from 'vite';

/**
 * Puts each page's first screen, the portfolio strip, the brand and an
 * empty content area, into the page's root element at build time, rendered
 * from the same components the script draws. The page shows them before
 * the script has loaded, and the script draws the same markup over them.
 */
const PLACEHOLDER = '<div id="root"><!-- page-shell --></div>';
const SHELL = fileURLToPath(new URL('../app/shell.tsx', import.meta.url));

type Shell = typeof import('../app/shell.jsx');

export const pageShell = (): Plugin => {
    let base = '/';
    let shell: Promise<Shell> | undefined;
    return {
        name: 'shelflens-page-shell',
        configResolved: (config) => {
            base = config.base;
        },
        transformIndexHtml: {
            order: 'pre',
            handler: async (html, { path }) => {
                if (!html.includes(PLACEHOLDER)) return html;
                // Loaded through Vite, so the components see the site's base as they do in the page.
                shell ??= runnerImport<Shell>(SHELL, {
                    configFile: false,
                    base,
                    logLevel: 'silent',
                }).then(({ module }) => module);
                const markup = (await shell).shellFor(path);
                return html.replace(PLACEHOLDER, () => `<div id="root">${markup}</div>`);
            },
        },
    };
};
