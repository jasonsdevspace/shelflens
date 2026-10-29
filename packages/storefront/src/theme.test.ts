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
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
    // The one inline script in the head, by its position rather than a pattern.
    const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));

    it('is read from the shared key before the first paint, with both values', () => {
        expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'));
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
        expect(html).not.toContain('name="color-scheme"');
    });
});
