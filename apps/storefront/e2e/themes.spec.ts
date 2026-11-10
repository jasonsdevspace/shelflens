import { PAGES } from '../src/bench/pages.js';
import { expect, test, violationsOf } from './support.js';

/*
 * Every page Lighthouse audits, audited by axe in the light theme and in
 * the dark, on the desktop and on the phone, contrast included. The dark
 * theme is where a token that fails contrast hides, and Lighthouse loads
 * each page in the light theme only.
 */

for (const colorScheme of ['light', 'dark'] as const) {
    test(`every page passes axe in the ${colorScheme} theme`, async ({ page, baseURL }) => {
        test.setTimeout(90_000);
        await page.emulateMedia({ colorScheme });
        const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
        // Every page is audited before any is judged, so one failure does not hide the rest.
        const violations: string[] = [];
        for (const { path, prepare, ready } of PAGES) {
            if (prepare) await prepare(page, origin);
            await page.goto(`${origin}${path}`);
            if (ready) await ready(page);
            await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
            violations.push(...(await violationsOf(page)).map((found) => `${path}: ${found}`));
        }
        expect(violations, `axe in the ${colorScheme} theme`).toEqual([]);
    });
}

/*
 * Paper is light and the browser drops backgrounds, so the kit prints the light theme whatever the
 * visitor chose. The host page's own rust, set by scheme rather than by theme, prints dark too.
 */
test('a host page prints its own colors in the light theme, from the dark theme', async ({
    page,
}) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/widget/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const item = page.locator('.host ul li').first();
    await expect(item).toHaveCSS('color', 'rgb(224, 128, 95)');
    await page.emulateMedia({ media: 'print' });
    await expect(item).toHaveCSS('color', 'rgb(183, 71, 42)');
});
