import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { Plugin } from 'vite';

import { WIDGET } from './shell-plugin.js';

/**
 * The pre-paint theme script, written once in theme.js and put into every
 * page's head where the page says so. Inline, so it runs before the first
 * paint and the page never flashes the other theme, and from one file, so
 * the pages cannot drift on the storage key or the fallback.
 *
 * A built page also gets its Content Security Policy here, as a meta tag
 * ahead of everything else in the head, since GitHub Pages sends no headers
 * of its own. Everything a page loads comes from its own origin, so the
 * policy allows that, the one inline script by its hash and the visit
 * counts' connection to Plausible, and nothing else. The dev server is left
 * without one, since Vite injects its styles and its client inline while it
 * serves.
 *
 * Beside it goes a referrer policy that hands any page the visitor goes on
 * to the site's origin and nothing more. The store keeps a search in its
 * address, and the portfolio shares the store's origin, so the browser's own
 * default would hand it the search, and its visit counter would send it on.
 */
const PLACEHOLDER = '<!-- theme-script -->';
const CHARSET = '<meta charset="UTF-8" />';

/**
 * The policy for a page. The widget's host pages also allow inline styles:
 * the widget falls back to a style element in its shadow root where a
 * browser cannot share one stylesheet across roots.
 */
const policyFor = (script: string, widget: boolean): string =>
    [
        "default-src 'self'",
        `script-src 'self' 'sha256-${createHash('sha256').update(script).digest('base64')}'`,
        widget ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
        "img-src 'self' data:",
        // The visit counts go to Plausible. Its tracker is bundled with the page, so no
        // script comes from there.
        "connect-src 'self' https://plausible.io",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
    ].join('; ');

export const themeScript = (): Plugin => {
    let building = false;
    return {
        name: 'shelflens-theme-script',
        configResolved: (config) => {
            building = config.command === 'build';
        },
        transformIndexHtml: {
            order: 'pre',
            handler: (html) => {
                if (!html.includes(PLACEHOLDER)) {
                    throw new Error(`a page has no place for the theme script: ${PLACEHOLDER}`);
                }
                const script = `\n${readFileSync(new URL('../../theme.js', import.meta.url), 'utf8')}`;
                // A function, so nothing in the script reads as a replacement pattern.
                const page = html.replace(PLACEHOLDER, () => `<script>${script}</script>`);
                if (!building) return page;
                if (!page.includes(CHARSET)) {
                    throw new Error(`a page has no ${CHARSET} to put its policy after`);
                }
                // The theme runs first, so the page still has the mount the shell fills.
                const widget = page.includes(WIDGET);
                const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(script, widget)}" />`;
                const referrer = '<meta name="referrer" content="strict-origin" />';
                return page.replace(
                    CHARSET,
                    () => `${CHARSET}\n        ${meta}\n        ${referrer}`
                );
            },
        },
    };
};
