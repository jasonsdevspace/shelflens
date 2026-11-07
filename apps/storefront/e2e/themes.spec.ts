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
 * Each color is one light-dark(), which picks by the scheme of the element that draws it, as the
 * kit's tests hold it. The build keeps it as written only when its target is the kit's own browser
 * floor. Any wider target rewrites it into switches set once on the root, and then a part of the
 * page set to the other scheme would keep the page's colors.
 */
test("a part of each page set to the other scheme draws that scheme's colors", async ({
    page,
    baseURL,
}) => {
    test.setTimeout(90_000);
    const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
    const drawn: string[] = [];
    for (const { path, prepare, ready } of PAGES) {
        if (prepare) await prepare(page, origin);
        const colors: Record<string, string> = {};
        for (const colorScheme of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme });
            await page.goto(`${origin}${path}`);
            if (ready) await ready(page);
            colors[colorScheme] = await page.evaluate(() => getComputedStyle(document.body).color);
        }
        // Still in the dark theme, the body alone is set to the light scheme.
        const switched = await page.evaluate(() => {
            document.body.style.colorScheme = 'light';
            return getComputedStyle(document.body).color;
        });
        drawn.push(`${path}: ${switched === colors['light'] ? 'light' : 'the page'}`);
        expect(colors['light'], path).not.toBe(colors['dark']);
    }
    expect(drawn).toEqual(PAGES.map(({ path }) => `${path}: light`));
});
