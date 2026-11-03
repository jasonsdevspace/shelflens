import type { Locator, Page } from '@playwright/test';

import { STOPS } from '../src/tour/stops.js';
import { audit, expect, test } from './support.js';

// The tour's own tests are the first visit the others are not.
test.use({ tourSeen: false });

/*
 * The tour on a first visit: it opens itself, each stop leads somewhere,
 * and once finished it stays closed until asked for.
 */

test('opens on a first visit, walks every stop, and stays closed once finished', async ({
    page,
}) => {
    await page.goto('/');
    const tour = page.getByRole('complementary', { name: 'Tour' });
    await expect(tour).toBeVisible();
    await expect(tour).toContainText('Stop 1 of');
    await audit(page);

    // The cache key stop, the fifth, lands on the product only members may see.
    for (let next = 0; next < 4; next += 1) {
        await tour.getByRole('button', { name: 'Next' }).click();
    }
    await expect(tour).toContainText('The cache that forgets who is asking');
    await tour.getByRole('link', { name: 'Try it' }).click();
    await expect(page).toHaveURL(/product=SL-00008/);
    await expect(page.getByText(/There is no product/)).toBeVisible();
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('results');
    await expect(tour).toBeVisible();

    let finished = false;
    for (let i = 0; i < 20 && !finished; i += 1) {
        const finish = tour.getByRole('button', { name: 'Finish' });
        if (await finish.isVisible()) {
            await finish.click();
            finished = true;
        } else {
            await tour.getByRole('button', { name: 'Next' }).click();
        }
    }
    expect(finished).toBe(true);
    await expect(tour).toBeHidden();

    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Search the store' })).toBeVisible();
    await expect(tour).toBeHidden();
    await page.getByRole('button', { name: 'Tour' }).click();
    await expect(tour).toBeVisible();
});

/*
 * What each stop's body says the page shows, seen on the page its "Try it"
 * leads to. Each presses "Try it" itself, and looks in the page's main
 * region, since the tour quotes some of the same words.
 */
type Landing = (page: Page, main: Locator, tryIt: () => Promise<void>) => Promise<void>;
const after =
    (check: (page: Page, main: Locator) => Promise<void>): Landing =>
    async (page, main, tryIt) => {
        await tryIt();
        await check(page, main);
    };
/** The typing stops lead to the empty box, so search first and "Try it" has somewhere to bring the page back from. */
const empty: Landing = async (page, _, tryIt) => {
    const box = page.getByRole('combobox', { name: 'Search the store' });
    await box.fill('boot');
    await box.press('Enter');
    await expect(page).toHaveURL(/q=boot/);
    await tryIt();
    await expect.poll(() => new URL(page.url()).search).toBe('');
    await expect(box).toHaveValue('');
};
const LANDINGS: Readonly<Record<string, Landing>> = {
    stale: empty,
    debounce: empty,
    combobox: empty,
    recent: empty,
    'cache-key': after((_, main) => expect(main.getByText(/There is no product/)).toBeVisible()),
    // The catalog's "Café" is indexed folded, so the typed "cafe" matches it.
    normalization: after(async (_, main) => {
        const card = main
            .getByRole('listitem')
            .filter({ hasText: /Café Racer Jacket/ })
            .first();
        await expect(card.getByText('"cafe" matched "cafe" in the name')).toBeVisible();
    }),
    facets: after((page) => expect(page.getByRole('group', { name: 'Brand' })).toBeVisible()),
    url: after(async (page) => {
        await expect(page.getByRole('checkbox', { name: /^Ridgeback/ })).toBeChecked();
        await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveValue('price-asc');
    }),
    paging: after((_, main) =>
        expect(main.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    ),
    edges: after((_, main) => expect(main.getByText(/past the last page/)).toBeVisible()),
    rules: after(async (_, main) => {
        await expect(main.getByText(/Featured jackets/).first()).toBeVisible();
        await expect(main.getByRole('button', { name: 'Sort by relevance' })).toBeVisible();
    }),
    explain: after((_, main) =>
        expect(main.getByText(/"jackit" is one typo away from "jacket"/).first()).toBeVisible()
    ),
    'rules-editor': after((_, main) =>
        expect(main.getByRole('button', { name: 'Add a rule' })).toBeVisible()
    ),
    // Open a jacket and reload: the next visit counts the open.
    popularity: async (page, main, tryIt) => {
        await tryIt();
        await main.getByRole('list', { name: 'Products' }).getByRole('link').nth(2).click();
        await expect(page).toHaveURL(/product=/);
        await page.goBack();
        await page.reload();
        await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
        await expect(
            main
                .locator('.card-explain')
                .filter({ hasText: 'Opened from the results in 1 earlier visit' })
        ).toHaveCount(1);
    },
    nothing: after((_, main) => expect(main.getByText(/Showing results for/)).toBeVisible()),
    prices: after(async (page, main) => {
        await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveValue('price-desc');
        await expect(main.getByText(/\$[\d,.]+ to \$[\d,.]+/).first()).toBeVisible();
    }),
    'cold-start': after((_, main) =>
        expect(main.getByRole('heading', { name: /Most rated in/ })).toBeVisible()
    ),
    telemetry: empty,
};

test('lands every stop on the page its body describes', async ({ page }) => {
    expect(Object.keys(LANDINGS).sort()).toEqual(
        STOPS.filter((stop) => stop.to !== undefined)
            .map((stop) => stop.id)
            .sort()
    );
    await page.goto('/');
    const tour = page.getByRole('complementary', { name: 'Tour' });
    const main = page.getByRole('main');
    const shown = async () =>
        Number(/Stop (\d+) of/.exec((await tour.textContent()) ?? '')?.[1] ?? 0);
    for (const [index, stop] of STOPS.entries()) {
        // A reload opens the tour at its first stop, so walk back to this one.
        while ((await shown()) < index + 1) {
            await tour.getByRole('button', { name: 'Next' }).click();
        }
        await expect(tour, stop.id).toContainText(`Stop ${String(index + 1)} of`);
        await expect(tour, stop.id).toContainText(stop.title);
        const landing = LANDINGS[stop.id];
        if (landing) {
            await test.step(stop.id, () =>
                landing(page, main, () => tour.getByRole('link', { name: 'Try it' }).click())
            );
        } else {
            await expect(tour.getByRole('link', { name: 'Try it' })).toHaveCount(0);
        }
    }
});

test('the tour never covers a card that focus reaches', async ({ page }) => {
    await page.goto('?category=clothing');
    await expect(page.getByRole('complementary', { name: 'Tour' })).toBeVisible();
    await page.locator('.cards > .card a').first().focus();
    for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() => {
            const focused = document.activeElement?.getBoundingClientRect();
            const tour = document.querySelector('.tour')?.getBoundingClientRect();
            const overlaps =
                focused !== undefined &&
                tour !== undefined &&
                focused.right > tour.left &&
                focused.left < tour.right &&
                focused.bottom > tour.top &&
                focused.top < tour.bottom;
            return {
                onCard: document.activeElement?.matches('.cards > .card a') ?? false,
                overlaps,
            };
        });
        // Still on the cards, and none of it under the tour.
        expect(where.onCard, `focus after ${String(step + 1)} presses`).toBe(true);
        expect(where.overlaps, `focus after ${String(step + 1)} presses`).toBe(false);
    }
});
