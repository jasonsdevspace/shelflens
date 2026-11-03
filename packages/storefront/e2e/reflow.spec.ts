import { audit, expect, type Page, test } from './support.js';

/*
 * No page scrolls sideways at a phone's width or wider, at text sizes up to
 * twice the usual, set as a visitor's own larger text would set it, through
 * the root every size is drawn from. 400% zoom on a 1280 window is 320 wide
 * at the usual size, so it is among them. The one thing that may scroll
 * sideways is the table of sizes and colors, inside its own frame.
 */

const WIDTHS = [320, 360, 375, 390, 412, 768, 1280];
const TEXT_SIZES = ['100%', '125%', '150%', '200%'];

const PAGES = [
    ['the home page', '/'],
    ['a search with Explain ranking on', '/?q=jacket&explain=1'],
    ['the rules editor', '/?q=jacket&explain=1&rules=1'],
    ['a second page of results', '/?q=boot&page=2'],
    ['a product', '/?product=SL-00001'],
    ['a search that found nothing', '/?q=zzqx%20jacket'],
    ['the about page', '/about/'],
    ["the page for a visitor's own catalog", '/try/'],
] as const;

/** Every width and text size at which the page is wider than the screen, with how wide it was. */
const overflows = async (page: Page): Promise<string[]> => {
    const found: string[] = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        for (const size of TEXT_SIZES) {
            const wide = await page.evaluate((fontSize) => {
                document.documentElement.style.setProperty('font-size', fontSize);
                return document.documentElement.scrollWidth;
            }, size);
            if (wide > width) found.push(`${String(width)} wide at ${size}: ${String(wide)}`);
        }
    }
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    return found;
};

for (const [name, path] of PAGES) {
    test(`${name} never scrolls sideways, whatever the width and text size`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await overflows(page)).toEqual([]);
    });
}

test.describe('before the store is ready', () => {
    test.use({ javaScriptEnabled: false });

    for (const [name, path] of PAGES) {
        test(`${name} keeps its room without scrolling sideways`, async ({ page }) => {
            await page.goto(path);
            expect(await overflows(page)).toEqual([]);
        });
    }
});

test.describe('with the tour showing', () => {
    test.use({ tourSeen: false });

    test('the bar that offers it, then the tour, never scroll the page sideways', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto('/?q=jacket');
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await expect(tour).toContainText('A tour of what to try');
        expect(await overflows(page)).toEqual([]);
        await page.setViewportSize({ width: 320, height: 640 });
        await tour.getByRole('button', { name: 'Start' }).click();
        await expect(tour).toContainText('Stop 1 of');
        expect(await overflows(page)).toEqual([]);
    });
});

test('the only sideways scrolling is the table of sizes and colors, in a frame that can be reached', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/?product=SL-00001');
    const frame = page.getByRole('region', { name: 'Sizes and colors' });
    await expect(frame).toBeVisible();
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
    const scrollers = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
            .filter((element) => {
                const { overflowX } = getComputedStyle(element);
                return (
                    (overflowX === 'auto' || overflowX === 'scroll') &&
                    element.scrollWidth > element.clientWidth
                );
            })
            .map((element) => element.className)
    );
    expect(scrollers).toEqual(['variants-frame']);
    await frame.focus();
    await expect(frame).toBeFocused();
});

test('audits clean at a phone width with text at twice its size', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const [, path] of PAGES) {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
        await audit(page);
    }
});
