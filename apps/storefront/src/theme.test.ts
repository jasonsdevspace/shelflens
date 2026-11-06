// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';
import { THEME_PLACEHOLDER, themeScriptHash } from '@jasonsdevspace/design-kit/vite';
import { describe, expect, it } from 'vitest';

import { policyFor } from './dev/page-policy-plugin.js';

/*
 * The page follows the theme the portfolio saves. The design kit holds that contract, the storage
 * key, its two values and the script that reads them before the first paint, and its plugin puts the
 * script into each page. This holds the pages to asking for it, and the page's policy to allowing
 * that script by the kit's own hash and no other, so a new version of the script cannot go out with
 * a policy that refuses it.
 */
const PAGES = [
    'index.html',
    'about/index.html',
    'try/index.html',
    'try/widget/index.html',
    'widget/index.html',
];

describe('the theme the portfolio saved', () => {
    const pages = PAGES.map((page) => readFileSync(join(__dirname, '..', page), 'utf8'));

    it("asks for the kit's script in each page's head, before the first paint", () => {
        for (const html of pages) {
            expect(html.split(THEME_PLACEHOLDER)).toHaveLength(2);
            expect(html.indexOf(THEME_PLACEHOLDER)).toBeLessThan(html.indexOf('</head>'));
        }
    });

    it("reads the key the portfolio saves under, as the kit's script does", () => {
        expect(THEME_KEY).toBe('theme');
    });

    it('allows the one inline script by the hash the kit gives for it, and no other', () => {
        for (const widget of [false, true]) {
            const scripts = /script-src ([^;]+)/.exec(policyFor(widget))?.[1];
            expect(scripts).toBe(`'self' ${themeScriptHash}`);
        }
    });

    it('leaves the color scheme to the stylesheet, so nothing paints before the choice', () => {
        for (const html of pages) expect(html).not.toContain('name="color-scheme"');
    });
});
