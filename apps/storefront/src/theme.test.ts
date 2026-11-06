// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { THEME_KEY, themeScript } from '@jasonsdevspace/design-kit/theme';
import { THEME_PLACEHOLDER } from '@jasonsdevspace/design-kit/vite';
import { describe, expect, it } from 'vitest';

import config from '../vite.config.js';
import { withPolicy } from './dev/page-policy-plugin.js';

/*
 * The page follows the theme the portfolio saves. The design kit holds that contract, the storage
 * key, its two values and the script that reads them before the first paint, and its plugin puts
 * the script into each page. This holds every page the build makes to asking for it, and each built
 * page's policy to allowing the very script that lands in it, by its hash, so a new version of the
 * script cannot go out with a policy that refuses it.
 */
const inputs = config.build?.rolldownOptions?.input;
const PAGES = Object.values(typeof inputs === 'object' && !Array.isArray(inputs) ? inputs : {});

/**
 * A page as the build makes it: the kit's script where the page asks for it, as the kit's plugin
 * puts it there, and then the page's policy.
 */
const built = (html: string) =>
    withPolicy(html.replace(THEME_PLACEHOLDER, () => `<script>${themeScript}</script>`));

const policyOf = (html: string) =>
    /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';

describe('the theme the portfolio saved', () => {
    it('finds every page the build makes', () => {
        expect(PAGES.length).toBeGreaterThan(1);
    });

    it("asks for the kit's script once in each page's head, before the first paint", () => {
        for (const page of PAGES) {
            const html = readFileSync(page, 'utf8');
            expect(html.split(THEME_PLACEHOLDER), page).toHaveLength(2);
            expect(html.indexOf(THEME_PLACEHOLDER), page).toBeLessThan(html.indexOf('</head>'));
        }
    });

    it("reads the key the portfolio saves under, as the kit's script does", () => {
        expect(THEME_KEY).toBe('theme');
    });

    it('allows each built page the one inline script that lands in it, by its hash, and no other', () => {
        for (const page of PAGES) {
            const html = built(readFileSync(page, 'utf8'));
            // Each inline script's text, read by splitting at its tags, as the build writes them.
            const scripts = html
                .split('<script>')
                .slice(1)
                .map((part) => part.split('</script>')[0] ?? '');
            expect(scripts, page).toHaveLength(1);
            const hash = createHash('sha256')
                .update(scripts[0] ?? '')
                .digest('base64');
            expect(/script-src ([^;]+)/.exec(policyOf(html))?.[1], page).toBe(
                `'self' 'sha256-${hash}'`
            );
        }
    });

    it("allows a widget page's inline styles whether or not the shell has filled its mount", () => {
        for (const mount of ['<!-- widget-waiting -->', '<p>Loading the search box</p>']) {
            const html = built(
                `<head><meta charset="UTF-8" />${THEME_PLACEHOLDER}</head>` +
                    `<body><div id="shelflens-search">${mount}</div></body>`
            );
            expect(policyOf(html), mount).toContain("style-src 'self' 'unsafe-inline'");
        }
        const plain = built(
            `<head><meta charset="UTF-8" />${THEME_PLACEHOLDER}</head><body></body>`
        );
        expect(policyOf(plain)).toContain("style-src 'self';");
    });

    it('leaves the color scheme to the stylesheet, so nothing paints before the choice', () => {
        for (const page of PAGES)
            expect(readFileSync(page, 'utf8')).not.toContain('name="color-scheme"');
    });
});
