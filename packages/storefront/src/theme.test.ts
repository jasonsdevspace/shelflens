import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * The page follows the theme the portfolio saves. The contract is the
 * storage key and its two values, which the portfolio's theme provider
 * writes and the script in index.html reads before the first paint. This
 * holds the script to that contract, so a change on either side fails a
 * build rather than a visitor's eyes.
 */
describe('the theme the portfolio saved', () => {
    const script = readFileSync(join(__dirname, '..', 'theme.js'), 'utf8');
    const pages = ['index.html', 'about/index.html'].map((page) =>
        readFileSync(join(__dirname, '..', page), 'utf8')
    );

    it('is read from the shared key before the first paint, with both values', () => {
        for (const html of pages) {
            expect(html.indexOf('<!-- theme-script -->')).toBeGreaterThan(-1);
            expect(html.indexOf('<!-- theme-script -->')).toBeLessThan(html.indexOf('</head>'));
        }
        expect(script).toContain("localStorage.getItem('theme')");
        expect(script).toContain("'dark'");
        expect(script).toContain("'light'");
        expect(script).toContain("setAttribute('data-theme'");
    });

    it('follows the system when nothing is saved, and the portfolio when it saves', () => {
        expect(script).toContain("matchMedia('(prefers-color-scheme: dark)')");
        expect(script).toContain("media.addEventListener('change'");
        expect(script).toContain("addEventListener('storage'");
    });

    it('leaves the color scheme to the stylesheet, so nothing paints before the choice', () => {
        for (const html of pages) expect(html).not.toContain('name="color-scheme"');
    });
});
