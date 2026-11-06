import { themeScriptHash } from '@jasonsdevspace/design-kit/vite';
import type { Plugin } from 'vite';

import { WIDGET } from './shell-plugin.js';

/**
 * A built page's Content Security Policy, as a meta tag ahead of everything else in the head, since
 * GitHub Pages sends no headers of its own. Everything a page loads comes from its own origin, so
 * the policy allows that, the design kit's pre-paint theme script by the hash the kit gives for it,
 * and the visit counts' connection to Plausible, and nothing else. The kit's own plugin puts the
 * script into the page, and reads the theme the portfolio saved, so the store and the portfolio
 * switch together. The dev server is left without a policy, since Vite injects its styles and its
 * client inline while it serves.
 *
 * Beside it goes a referrer policy that hands any page the visitor goes on to the site's origin and
 * nothing more. The store keeps a search in its address, and the portfolio shares the store's
 * origin, so the browser's own default would hand it the search, and its visit counter would send
 * it on.
 */
const CHARSET = '<meta charset="UTF-8" />';

/**
 * The policy for a page. The widget's host pages also allow inline styles: the widget falls back to
 * a style element in its shadow root where a browser cannot share one stylesheet across roots.
 */
export const policyFor = (widget: boolean): string =>
    [
        "default-src 'self'",
        `script-src 'self' ${themeScriptHash}`,
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

export const pagePolicy = (): Plugin => {
    let building = false;
    return {
        name: 'shelflens-page-policy',
        configResolved: (config) => {
            building = config.command === 'build';
        },
        // Early, so the page still has the widget's mount, which the shell fills later.
        transformIndexHtml: {
            order: 'pre',
            handler: (html) => {
                if (!building) return html;
                if (!html.includes(CHARSET)) {
                    throw new Error(`a page has no ${CHARSET} to put its policy after`);
                }
                const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(html.includes(WIDGET))}" />`;
                const referrer = '<meta name="referrer" content="strict-origin" />';
                // A function, so nothing in the policy reads as a replacement pattern.
                return html.replace(
                    CHARSET,
                    () => `${CHARSET}\n        ${meta}\n        ${referrer}`
                );
            },
        },
    };
};
