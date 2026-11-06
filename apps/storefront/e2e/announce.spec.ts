import { expect, type Page, test } from './support.js';

/*
 * What a screen reader hears of the results as a shopper changes them. Each landed answer is said
 * in the results' status region, but a shopper stepping through a facet's options with the arrow
 * keys lands an answer at every press, and hearing each one buries the one they stop on. So the
 * region says the answer once the shopper pauses, while the page itself follows every step, and an
 * answer that comes back in the same words is said again.
 */

/**
 * Once the page has said its first answer, every time from then on that the results' status
 * region fills with an answer, which is what a screen reader is given to say. A line is counted
 * each time the region goes from empty to holding words, so the same words said again count again.
 */
const listen = async (page: Page) => {
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    const said = (await heading.textContent())?.trim() ?? '';
    // The arrival line has to be said before listening starts, or it would be counted.
    await expect
        .poll(() =>
            page.evaluate(
                (start) =>
                    [...document.querySelectorAll('p.visually-hidden[role="status"]')].some(
                        (region) => region.textContent.startsWith(start)
                    ),
                said
            )
        )
        .toBe(true);
    await page.evaluate((start) => {
        const region = [...document.querySelectorAll('p.visually-hidden[role="status"]')].find(
            (candidate) => candidate.textContent.startsWith(start)
        );
        if (!region) throw new Error('expected the results status region');
        const heard: string[] = [];
        Reflect.set(window, 'heard', heard);
        let before = region.textContent.trim();
        new MutationObserver(() => {
            const now = region.textContent.trim();
            if (before === '' && now !== '') heard.push(now);
            before = now;
        }).observe(region, { childList: true, characterData: true, subtree: true });
    }, said);
};

const heard = (page: Page) =>
    page.evaluate((): string[] => {
        const lines: unknown = Reflect.get(window, 'heard');
        return Array.isArray(lines) ? lines.map(String) : [];
    });

/**
 * What the region has said, once it has said something and a while longer than it waits to
 * settle.
 */
const quiet = async (page: Page) => {
    await expect.poll(() => heard(page), { timeout: 5000 }).not.toEqual([]);
    await page.waitForTimeout(1500);
    return heard(page);
};

test('says the results once a shopper stops stepping through a facet, not at every step', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./?q=jacket');
    const options = page.getByRole('group', { name: 'Price' }).getByRole('radio');
    await expect(options.nth(3)).toBeVisible();
    await listen(page);
    await options.first().focus();
    await page.keyboard.press('Space');
    // A tenth of a second apart, far inside the time the region waits to settle, so while the
    // answers land as quickly as the presses, no step stays long enough to be said.
    for (let step = 0; step < 3; step += 1) {
        await page.waitForTimeout(100);
        await page.keyboard.press('ArrowDown');
    }
    await expect(options.nth(3)).toBeChecked();
    const said = await quiet(page);
    expect(said).toHaveLength(1);
    const heading = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
    expect(said[0]).toContain(heading);
});

test('says the results again when a sort brings back the same words', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./?q=jacket');
    const sort = page.getByRole('combobox', { name: 'Sort by' });
    await expect(sort).toBeVisible();
    await listen(page);
    const before = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
    await sort.selectOption('price-asc');
    await expect.poll(() => page.evaluate(() => window.location.search)).toContain('sort=');
    const said = await quiet(page);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(before);
});
