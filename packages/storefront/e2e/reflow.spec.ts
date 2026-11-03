import { audit, expect, type Page, setTextSize, settle, test } from './support.js';

/*
 * No page reaches past the screen at a phone's width or wider, at text
 * sizes up to twice the usual, set as a visitor's own larger text sets it,
 * so the layouts that larger text brings on are the ones measured. 400%
 * zoom on a 1280 window is 320 wide at the usual size, so it is among them.
 * The things that may scroll sideways are the table of sizes and colors,
 * inside its own frame, and a block of code, whose lines would change if
 * they broke. Each can be reached from the keyboard to be scrolled.
 */

const WIDTHS = [320, 360, 375, 390, 412, 768, 1280];
const TEXT_SCALES = [1, 1.25, 1.5, 2];

const PAGES = [
    ['the home page', '/'],
    ['a search with Explain ranking on', '/?q=jacket&explain=1'],
    ['the rules editor', '/?q=jacket&explain=1&rules=1'],
    ['a second page of results', '/?q=boot&page=2'],
    ['a product', '/?product=SL-00001'],
    ['a search that found nothing', '/?q=zzqx%20jacket'],
    ['the about page', '/about/'],
    ["the page for a visitor's own catalog", '/try/'],
    ["the search box on another site's page", '/widget/'],
    ["the search box on another site's page, over a visitor's own catalog", '/try/widget/'],
] as const;

/** The pages served as a document of their own, which are what a visit before the script sees. */
const SHELLS = [
    ['the store', '/'],
    ['the about page', '/about/'],
    ["the page for a visitor's own catalog", '/try/'],
] as const;

/*
 * Cut off on purpose, so not a fault: the filled part of a rating's stars,
 * and a choice a select shortens with its ellipsis. Text kept for a screen
 * reader alone is drawn a pixel wide, and is passed over by its size, as is
 * a control drawn unseen over another to take its clicks.
 */
const CLIPPED_ON_PURPOSE = ['stars-fill', 'select'];

/**
 * What reaches past the screen as the page is drawn: the page itself, any
 * box drawn past its right edge, the tour's fixed sheet among them, and any
 * text cut off by a box too narrow for it. A box inside a frame that scrolls
 * or clips on purpose is that frame's to hold.
 */
const pastTheEdge = (page: Page, onPurpose: readonly string[]) =>
    page.evaluate((allowed) => {
        const width = document.documentElement.clientWidth;
        const named = (element: Element) =>
            `${element.tagName.toLowerCase()}.${element.className}`.trim();
        /** Whether a box between it and the page scrolls or clips it, and so holds it. */
        const held = (element: Element) => {
            for (let at = element.parentElement; at; at = at.parentElement) {
                if (getComputedStyle(at).overflowX !== 'visible') return true;
            }
            return false;
        };
        const drawnPast = (element: Element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.right > width + 1 && !held(element);
        };
        const overflowing = (element: Element) => element.scrollWidth > element.clientWidth + 1;
        /**
         * A box whose own text runs out past it, as a word too long for its line does. The box
         * ends inside the screen, but what it holds does not. A control draws its own content.
         */
        const spills = (element: Element, overflowX: string) =>
            overflowX === 'visible' &&
            element.clientWidth > 0 &&
            !element.matches('input, select, textarea, button, svg, svg *') &&
            overflowing(element) &&
            element.getBoundingClientRect().left + element.scrollWidth > width + 1;
        /** A box that scrolls sideways is a fault of its own, but for the table's frame and code. */
        const scrollsSideways = (element: Element, overflowX: string) =>
            (overflowX === 'auto' || overflowX === 'scroll') &&
            overflowing(element) &&
            !element.matches('.variants-frame, pre');
        // A text field scrolls its own text, as a visitor types past its end.
        const cutsOff = (element: Element, overflowX: string, opacity: string) =>
            (overflowX === 'hidden' || overflowX === 'clip') &&
            opacity !== '0' &&
            !element.matches('input, textarea') &&
            element.clientWidth > 1 &&
            overflowing(element) &&
            !allowed.some((name) => element.classList.contains(name));

        const found: string[] = [];
        if (document.documentElement.scrollWidth > width) {
            found.push(`the page is ${String(document.documentElement.scrollWidth)} wide`);
        }
        for (const element of document.querySelectorAll('body *')) {
            const { overflowX, opacity } = getComputedStyle(element);
            if (drawnPast(element)) {
                const right = Math.round(element.getBoundingClientRect().right);
                found.push(`${named(element)} ends at ${String(right)}`);
            }
            if (scrollsSideways(element, overflowX))
                found.push(`${named(element)} scrolls sideways`);
            if (cutsOff(element, overflowX, opacity))
                found.push(`${named(element)} cuts off its content`);
            if (spills(element, overflowX)) found.push(`${named(element)} spills past the screen`);
        }
        return found;
    }, onPurpose);

/** Every width and text size at which something reaches past the screen, with what it was. */
const overflows = async (page: Page, scripts = true): Promise<string[]> => {
    const found: string[] = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        for (const scale of TEXT_SCALES) {
            await setTextSize(page, scale);
            // Without a script nothing reacts to the change, and nothing would run a frame to wait on.
            if (scripts) await settle(page);
            for (const what of await pastTheEdge(page, CLIPPED_ON_PURPOSE)) {
                found.push(`${String(width)} wide at ${String(scale * 100)}%: ${what}`);
            }
        }
    }
    await setTextSize(page, 1);
    return found;
};

for (const [name, path] of PAGES) {
    test(`${name} never reaches past the screen, whatever the width and text size`, async ({
        page,
    }) => {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await overflows(page)).toEqual([]);
    });
}

test.describe('before the store is ready', () => {
    test.use({ javaScriptEnabled: false });

    for (const [name, path] of SHELLS) {
        test(`${name} keeps its room without reaching past the screen`, async ({ page }) => {
            await page.goto(path);
            expect(await overflows(page, false)).toEqual([]);
        });
    }
});

test.describe('with the tour showing', () => {
    test.use({ tourSeen: false });

    test('the bar that offers it, then the tour, stay within the screen', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto('/?q=jacket');
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await expect(tour).toContainText('A tour of what to try');
        expect(await overflows(page)).toEqual([]);
        await page.setViewportSize({ width: 320, height: 640 });
        await settle(page);
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
    await expect(page.getByRole('heading', { name: 'Sizes and colors' })).toBeVisible();
    await setTextSize(page, 2);
    await settle(page);
    const frame = page.getByRole('region', { name: 'Sizes and colors' });
    await expect(frame).toBeVisible();
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

test('the table of sizes and colors is no stop of its own where it fits', async ({ page }) => {
    await page.goto('/?product=SL-00001');
    await expect(page.getByRole('heading', { name: 'Sizes and colors' })).toBeVisible();
    await settle(page);
    await expect(page.getByRole('region', { name: 'Sizes and colors' })).toHaveCount(0);
    await expect(page.locator('.variants-frame')).not.toHaveAttribute('tabindex');
});

test('audits clean at a phone width with text at twice its size', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await setTextSize(page, 2);
    for (const [, path] of PAGES) {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        await audit(page);
    }
});
