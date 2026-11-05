import { expect, type Page, settle, test } from './support.js';

/*
 * The column beside the results on a wide screen: it never scrolls sideways, and it scrolls with
 * the page unless it fits on the screen, where it stays in view beside the results.
 */

/**
 * The text spacing WCAG 1.4.12 says a page must take without losing anything, which widens every
 * word while the column, sized in rem, stays as it is. So the facets are measured with their text
 * spaced wider than a font draws it, rather than with whichever font the machine running the test
 * has.
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

/** A store page on a wide screen of the height given, with the column named drawn. */
const openStore = async (page: Page, height: number, path = '/', name = 'Filters') => {
    await page.setViewportSize({ width: 1280, height });
    await page.goto(path);
    await page.getByRole('complementary', { name }).waitFor();
    await settle(page);
};

/** Shows every brand, color and size, so the column is as tall as it gets. */
const showEverything = async (page: Page) => {
    // Each press turns its button into "Show fewer", so the next one is the first left.
    const more = page.getByRole('button', { name: /^Show all \d+ / });
    while ((await more.count()) > 0) await more.first().click();
};

/** How tall the filters column is drawn. */
const columnHeight = (page: Page) =>
    page.getByRole('complementary', { name: 'Filters' }).evaluate((aside) => aside.clientHeight);

/** How the filters column is drawn, and how far each facet reaches past it. */
const column = (page: Page, name = 'Filters') =>
    page.evaluate((label) => {
        const aside = document.querySelector(`aside[aria-label="${label}"]`);
        if (!aside) throw new Error(`expected the ${label} column`);
        const edge = aside.getBoundingClientRect().right;
        return {
            scrollsSideways: aside.scrollWidth > aside.clientWidth,
            scrollsItself: getComputedStyle(aside).overflowY !== 'visible',
            pinned: getComputedStyle(aside).position === 'sticky',
            past: [...aside.querySelectorAll('fieldset')]
                .map((facet) => facet.getBoundingClientRect().right - edge)
                .filter((past) => past > 0.5),
        };
    }, name);

test('fits every facet in the column, with the text spaced as wide as WCAG asks', async ({
    page,
}) => {
    await openStore(page, 800);
    await showEverything(page);
    await spaceTheText(page);
    expect(await column(page)).toMatchObject({ scrollsSideways: false, past: [] });
});

test('fits the rules column too, with the text spaced as wide', async ({ page }) => {
    await openStore(page, 800, '/?q=jacket&explain=1&rules=1', 'Rules');
    await spaceTheText(page);
    const rules = await page.evaluate(() => {
        const aside = document.querySelector('aside[aria-label="Rules"]');
        if (!aside) throw new Error('expected the rules column');
        return aside.scrollWidth > aside.clientWidth;
    });
    expect(rules).toBe(false);
});

test('scrolls with the page when the column is taller than the screen', async ({ page }) => {
    await openStore(page, 700);
    await showEverything(page);
    expect(await columnHeight(page)).toBeGreaterThan(700);
    await expect.poll(async () => (await column(page)).pinned).toBe(false);
    expect((await column(page)).scrollsItself).toBe(false);
    // The last facet is reached by scrolling the page, which moves the column with it.
    const rating = page.getByRole('group', { name: 'Rating' });
    await rating.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(rating).toBeInViewport();
});

test('stays in view beside the results when the column fits on the screen', async ({ page }) => {
    await openStore(page, 900);
    // A screen taller than the column by more than the room above it.
    await page.setViewportSize({ width: 1280, height: (await columnHeight(page)) + 200 });
    await expect.poll(async () => (await column(page)).pinned).toBe(true);
    expect((await column(page)).scrollsItself).toBe(false);
    const filters = page.getByRole('complementary', { name: 'Filters' });
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(filters.getByRole('group', { name: 'Category' })).toBeInViewport();
});

test('keeps the column still when showing a list makes it too tall to stay in view', async ({
    page,
}) => {
    // Narrow enough for two columns of cards, so the results run on well past the column.
    await openStore(page, 900);
    await page.setViewportSize({ width: 820, height: (await columnHeight(page)) + 200 });
    await expect.poll(async () => (await column(page)).pinned).toBe(true);
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    const filters = page.getByRole('complementary', { name: 'Filters' });
    const before = await filters.boundingBox();
    await page.getByRole('button', { name: /^Show all \d+ colors$/ }).click();
    await expect.poll(async () => (await column(page)).pinned).toBe(false);
    // The column stays where it was on the screen, rather than jumping back to its place up the
    // page with the button the shopper pressed.
    const after = await filters.boundingBox();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
});

test('shows the way past the column at the top of the column, wherever the page is', async ({
    page,
}) => {
    await openStore(page, 700);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const filters = page.getByRole('complementary', { name: 'Filters' });
    const skip = filters.getByRole('link', { name: 'Skip to results' });
    await skip.focus();
    const [link, aside] = await Promise.all([skip.boundingBox(), filters.boundingBox()]);
    expect(link?.y ?? 0).toBeGreaterThanOrEqual(aside?.y ?? 0);
    expect(link?.x ?? 0).toBeGreaterThanOrEqual(aside?.x ?? 0);
});
