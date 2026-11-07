import { PAGES } from '../src/bench/pages.js';
import { expect, test } from './support.js';

/*
 * Each color is one light-dark(), which picks by the scheme of the element that draws it, as the
 * kit's tests hold it. The build keeps it as written only when its target is no wider than the
 * kit's browser floor. A wider target rewrites it into switches set once on the root, and then a
 * part of the page set to the other scheme would keep the page's colors. That is a fact of the
 * build rather than of the screen, so it runs on the desktop alone.
 */

/** The colors the body draws, its text and its ground. */
const bodyColors = () => {
    const style = getComputedStyle(document.body);
    return `${style.color} on ${style.backgroundColor}`;
};

test("a part of each page set to the other scheme draws that scheme's colors", async ({
    page,
    baseURL,
}) => {
    test.setTimeout(90_000);
    const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
    // Every page is measured before any is judged, so one failure does not hide the rest.
    const drawn: string[] = [];
    for (const { path, prepare, ready } of PAGES) {
        if (prepare) await prepare(page, origin);
        const colors: Record<string, string> = {};
        for (const colorScheme of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme });
            await page.goto(`${origin}${path}`);
            if (ready) await ready(page);
            await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
            colors[colorScheme] = await page.evaluate(bodyColors);
        }
        // Still in the dark theme, the body alone is set to the light scheme.
        await page.evaluate(() => {
            document.body.style.colorScheme = 'light';
        });
        const switched = await page.evaluate(bodyColors);
        drawn.push(
            colors['light'] === colors['dark']
                ? `${path}: the same in both themes`
                : `${path}: ${switched === colors['light'] ? 'light' : 'the page'}`
        );
    }
    expect(drawn).toEqual(PAGES.map(({ path }) => `${path}: light`));
});
