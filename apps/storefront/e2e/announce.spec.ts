import { expect, type Page, test } from './support.js';

/*
 * What a screen reader hears of the results as a shopper changes them. Each landed answer is said
 * in the status region, but a shopper stepping through a facet's options with the arrow keys lands
 * an answer at every step, and hearing each one buries the one they stop on. So the region says
 * the answer once the shopper pauses, while the page itself follows every step.
 */

/** Every line the results' status region says from now on, read as the region changes. */
const listen = (page: Page) =>
    page.evaluate(() => {
        const said: string[] = [];
        Reflect.set(window, 'said', said);
        const regions = [...document.querySelectorAll('p.visually-hidden[role="status"]')];
        const watcher = new MutationObserver(() => {
            for (const region of regions) {
                const text = region.textContent.trim();
                if (text !== '' && said.at(-1) !== text) said.push(text);
            }
        });
        for (const region of regions) {
            watcher.observe(region, { childList: true, characterData: true, subtree: true });
        }
    });

const heard = (page: Page) =>
    page.evaluate((): string[] => {
        const said: unknown = Reflect.get(window, 'said');
        return Array.isArray(said) ? said.map(String) : [];
    });

test('says the results once a shopper stops stepping through a facet, not at every step', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./?q=jacket');
    const price = page.getByRole('group', { name: 'Price' });
    const options = price.getByRole('radio');
    await expect(options.nth(3)).toBeVisible();
    await listen(page);
    await options.first().focus();
    await page.keyboard.press('Space');
    // A shopper stepping down the options to look at each, a press every few tenths of a second,
    // each press landing an answer and drawing it.
    for (let step = 0; step < 3; step += 1) {
        await page.waitForTimeout(300);
        await page.keyboard.press('ArrowDown');
    }
    const heading = page.getByRole('heading', { level: 1 });
    await expect(options.nth(3)).toBeChecked();
    // The page follows every step at once.
    await expect.poll(() => page.evaluate(() => window.location.search)).toContain('price=');
    // The region says the answer the shopper stopped on, once, after the pause.
    await expect.poll(() => heard(page), { timeout: 5000 }).not.toEqual([]);
    await page.waitForTimeout(1500);
    const said = await heard(page);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(((await heading.textContent()) ?? '').trim());
});
