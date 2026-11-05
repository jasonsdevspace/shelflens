import { expect, type Page, settle, test } from './support.js';

/*
 * The column beside the results on a wide screen: it never scrolls sideways, and it scrolls with
 * the page unless it fits on the screen, where it stays in view beside the results.
 */

/**
 * The text spacing WCAG 1.4.12 says a page must take without losing anything, which widens every
 * word while the column, sized in rem, stays as it is. So the facets are measured with more text
 * than any font draws, rather than with whichever font the machine running the test has.
 */
const spaceTheText = (page: Page) =>
    // Set on each element, since the page's policy refuses a style sheet written into it.
    page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('body *')) {
            element.style.setProperty('letter-spacing', '0.12em', 'important');
            element.style.setProperty('word-spacing', '0.16em', 'important');
            element.style.setProperty('line-height', '1.5', 'important');
        }
    });

/** The store's home page, with the filters column drawn. */
const openStore = async (page: Page, height: number) => {
    await page.setViewportSize({ width: 1280, height });
    await page.goto('/');
    await page.getByRole('complementary', { name: 'Filters' }).waitFor();
    await settle(page);
};

/** How the filters column is drawn, and how far each facet reaches past it. */
const column = (page: Page) =>
    page.evaluate(() => {
        const aside = document.querySelector('aside[aria-label="Filters"]');
        if (!aside) throw new Error('expected the filters column');
        const edge = aside.getBoundingClientRect().right;
        return {
            scrollsSideways: aside.scrollWidth > aside.clientWidth,
            scrollsItself: getComputedStyle(aside).overflowY !== 'visible',
            pinned: getComputedStyle(aside).position === 'sticky',
            past: [...aside.querySelectorAll('fieldset')]
                .map((facet) => facet.getBoundingClientRect().right - edge)
                .filter((past) => past > 0.5),
        };
    });

test('fits every facet in the column, with the text spaced as wide as WCAG asks', async ({
    page,
}) => {
    await openStore(page, 800);
    for (const more of ['Show all 12 brands', 'Show all 14 colors']) {
        await page.getByRole('button', { name: more }).click();
    }
    await spaceTheText(page);
    expect(await column(page)).toMatchObject({ scrollsSideways: false, past: [] });
});

test('scrolls with the page when the column is taller than the screen', async ({ page }) => {
    await openStore(page, 700);
    expect(await column(page)).toMatchObject({ scrollsItself: false, pinned: false });
    // The last facet is reached by scrolling the page, which moves the column with it.
    const rating = page.getByRole('group', { name: 'Rating' });
    await rating.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(rating).toBeInViewport();
});

test('stays in view beside the results when the column fits on the screen', async ({ page }) => {
    await openStore(page, 1600);
    await expect.poll(async () => (await column(page)).pinned).toBe(true);
    expect((await column(page)).scrollsItself).toBe(false);
    const filters = page.getByRole('complementary', { name: 'Filters' });
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(filters.getByRole('group', { name: 'Category' })).toBeInViewport();
});
