import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { Plugin } from 'vite';

/**
 * The pre-paint theme script, written once in theme.js and put into every
 * page's head where the page says so. Inline, so it runs before the first
 * paint and the page never flashes the other theme, and from one file, so
 * the pages cannot drift on the storage key or the fallback.
 *
 * A built page also gets its Content Security Policy here, as a meta tag
 * ahead of everything else in the head, since GitHub Pages sends no headers
 * of its own. Everything a page loads comes from its own origin, so the
 * policy allows that and the one inline script, by its hash, and nothing
 * else. The dev server is left without one, since Vite injects its styles
 * and its client inline while it serves.
 */
const PLACEHOLDER = '<!-- theme-script -->';
const CHARSET = '<meta charset="UTF-8" />';

/**
 * The policy for a page. The widget's host pages also allow inline styles:
 * the widget falls back to a style element in its shadow root where a
 * browser cannot share one stylesheet across roots, and the pages hide the
 * waiting line with a style for a browser without JavaScript.
 */
export const policyFor = (script: string, widget: boolean): string =>
    [
        "default-src 'self'",
        `script-src 'self' 'sha256-${createHash('sha256').update(script).digest('base64')}'`,
        widget ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
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
                const widget = page.includes('id="shelflens-search"');
                const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(script, widget)}" />`;
                return page.replace(CHARSET, () => `${CHARSET}\n        ${meta}`);
            },
        },
    };
};
