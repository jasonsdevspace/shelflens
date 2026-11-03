import type { Locator, Page } from '@playwright/test';

import { STOPS } from '../src/tour/stops.js';
import { audit, expect, setTextSize, test } from './support.js';

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
    // A member is shown the product, marked as theirs alone.
    const main = page.getByRole('main');
    await expect(main.getByText('Members only')).toBeVisible();
    await expect(main.getByText(/There is no product/)).toBeHidden();
    await expect(tour).toBeVisible();

    // Every stop after the fifth is one Next away, and the last says Finish in place of Next.
    for (let next = 5; next < STOPS.length; next += 1) {
        await expect(tour.getByRole('button', { name: 'Finish' })).toHaveCount(0);
        await tour.getByRole('button', { name: 'Next' }).click();
    }
    await expect(tour).toContainText(`Stop ${String(STOPS.length)} of ${String(STOPS.length)}`);
    await expect(tour.getByRole('button', { name: 'Next' })).toHaveCount(0);
    await tour.getByRole('button', { name: 'Finish' }).click();
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
    // The walk has opened a jacket by now, so the rail may already say what was viewed with
    // this product. A browser that has viewed nothing gets the category's most rated.
    'cold-start': after(async (page, main) => {
        await expect(page).toHaveURL(/product=SL-00001/);
        await expect(
            main.getByRole('heading', { name: /^(Most rated in |Viewed with this product)/ })
        ).toBeVisible();
        const browser = page.context().browser();
        if (!browser) throw new Error('expected the page to have a browser');
        const fresh = await browser.newContext({ baseURL: new URL('/', page.url()).href });
        try {
            const first = await fresh.newPage();
            await first.goto(new URL(page.url()).search);
            await expect(
                first.getByRole('main').getByRole('heading', { name: /^Most rated in / })
            ).toBeVisible();
        } finally {
            await fresh.close();
        }
    }),
    telemetry: empty,
};

/** Whether the focused element is under the tour, even in part. */
const coveredByTour = (page: Page) =>
    page.evaluate(() => {
        const focused = document.activeElement?.getBoundingClientRect();
        const tour = document.querySelector('.tour')?.getBoundingClientRect();
        return (
            focused !== undefined &&
            tour !== undefined &&
            focused.right > tour.left &&
            focused.left < tour.right &&
            focused.bottom > tour.top &&
            focused.top < tour.bottom
        );
    });

test('stands the tour off the page in the dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Tour' })).toBeVisible();
    const backgrounds = await page.evaluate(() => {
        // The raised token as a color, drawn on an element of its own.
        const probe = document.body.appendChild(document.createElement('div'));
        probe.style.background = 'var(--dark-raised)';
        const raised = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
            raised,
            page: getComputedStyle(document.body).backgroundColor,
            tour: getComputedStyle(document.querySelector('.tour') ?? document.body)
                .backgroundColor,
            button: getComputedStyle(
                document.querySelector('.tour-nav .button:not(.button-primary)') ?? document.body
            ).backgroundColor,
        };
    });
    expect(backgrounds.tour).toBe(backgrounds.raised);
    // Its buttons sit on the panel, not in wells of the page's color.
    expect(backgrounds.button).toBe(backgrounds.raised);
    expect(backgrounds.raised).not.toBe(backgrounds.page);
});

// A phone's width without a phone's zooming out, so only the sheet's own layout is measured.
test('fits the bar and every stop across a phone-wide sheet with text at twice its size', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    const tour = page.getByRole('complementary', { name: 'Tour' });
    await expect(tour).toContainText('A tour of what to try');
    // As a visitor's own larger text sets it.
    await setTextSize(page, 2);
    const barSideways = await page.evaluate(() => {
        const bar = document.querySelector('.tour-offer');
        const answers = document.querySelector('.tour-offer-actions')?.getBoundingClientRect();
        return (
            bar === null ||
            answers === undefined ||
            answers.right > bar.getBoundingClientRect().right
        );
    });
    expect(barSideways, 'the bar').toBe(false);
    await tour.getByRole('button', { name: 'Start' }).click();
    await expect(tour).toContainText('Stop 1 of');
    for (let stop = 1; stop <= STOPS.length; stop += 1) {
        await expect(tour).toContainText(`Stop ${String(stop)} of`);
        const sideways = await page.evaluate(() => {
            const sheet = document.querySelector('.tour');
            return sheet !== null && sheet.scrollWidth > sheet.clientWidth;
        });
        expect(sideways, `sideways at stop ${String(stop)}`).toBe(false);
        if (stop < STOPS.length) await tour.getByRole('button', { name: 'Next' }).click();
    }
});

/** Whether the element `selector` names is wholly inside the part of the tour's sheet in view. */
const inSheet = (page: Page, selector: string) =>
    page.evaluate((target) => {
        const sheet = document.querySelector('.tour')?.getBoundingClientRect();
        const box = document.querySelector(target)?.getBoundingClientRect();
        return (
            sheet !== undefined &&
            box !== undefined &&
            box.top >= sheet.top - 1 &&
            box.bottom <= sheet.bottom + 1
        );
    }, selector);

// A 320 by 640 phone at 150% zoom, without a phone's zooming out, where buttons held at the
// foot of the sheet would cover the stop. A tap opens each stop at its title, and a keyboard
// visitor's focus on Next stays in view.
test.describe('on a short screen', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 213, height: 427 });
        await page.goto('/');
        await page
            .getByRole('complementary', { name: 'Tour' })
            .getByRole('button', { name: 'Start' })
            .click();
    });

    test('a tap on Next opens each stop at its title, with the buttons scrolling with it', async ({
        page,
    }) => {
        const tour = page.getByRole('complementary', { name: 'Tour' });
        for (let stop = 1; stop <= STOPS.length; stop += 1) {
            await expect(tour).toContainText(`Stop ${String(stop)} of`);
            expect(await inSheet(page, '.tour-title'), `the title at stop ${String(stop)}`).toBe(
                true
            );
            const pinned = await page.evaluate(
                () =>
                    getComputedStyle(document.querySelector('.tour-nav') ?? document.body).position
            );
            expect(pinned, `the buttons at stop ${String(stop)}`).toBe('static');
            if (stop < STOPS.length) await tour.getByRole('button', { name: 'Next' }).click();
        }
    });

    test('Next pressed from the keyboard stays in view on every stop', async ({ page }) => {
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await tour.getByRole('button', { name: 'Next' }).focus();
        for (let stop = 2; stop <= STOPS.length; stop += 1) {
            await page.keyboard.press('Enter');
            await expect(tour).toContainText(`Stop ${String(stop)} of`);
            expect(
                await inSheet(page, '.tour-steps .button:last-child'),
                `Next at stop ${String(stop)}`
            ).toBe(true);
        }
    });
});

test('keeps Close quiet under the pointer, so Try it stays the strong action', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('complementary', { name: 'Tour' });
    const close = tour.getByRole('button', { name: 'Close' });
    await close.hover();
    const edge = await close.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(edge).toBe('rgba(0, 0, 0, 0)');
});

test('keeps focus on Previous when it reaches the first stop', async ({ page }) => {
    await page.goto('/');
    const tour = page.getByRole('complementary', { name: 'Tour' });
    await tour.getByRole('button', { name: 'Next' }).click();
    const previous = tour.getByRole('button', { name: 'Previous' });
    await previous.focus();
    await page.keyboard.press('Enter');
    await expect(tour).toContainText('Stop 1 of');
    await expect(previous).toBeFocused();
    await expect(previous).toHaveAttribute('aria-disabled', 'true');
});

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
            const tryIt = async () => {
                await tour.getByRole('link', { name: 'Try it' }).click();
                await expect(
                    page.locator(stop.focus ?? 'h1'),
                    `${stop.id} takes focus`
                ).toBeFocused();
                expect(await coveredByTour(page), `${stop.id} is clear of the tour`).toBe(false);
            };
            await test.step(stop.id, () => landing(page, main, tryIt));
        } else {
            await expect(tour.getByRole('link', { name: 'Try it' })).toHaveCount(0);
        }
    }
});

/** The links Tab walks through the cards, and how many presses the walk takes. */
const CARD_LINKS = '.cards > .card a';
const TAB_STEPS = 12;

test('the tour never covers a card that focus reaches', async ({ page }) => {
    await page.goto('?category=clothing');
    await expect(page.getByRole('complementary', { name: 'Tour' })).toBeVisible();
    // Some of the cards Tab reaches start out under the tour, so keeping them clear is the test.
    await expect(page.locator(CARD_LINKS).nth(TAB_STEPS)).toBeVisible();
    const under = await page.evaluate(
        ({ cards, steps }) => {
            const tour = document.querySelector('.tour')?.getBoundingClientRect();
            if (!tour) return 0;
            return [...document.querySelectorAll(cards)].slice(0, steps + 1).filter((card) => {
                const box = card.getBoundingClientRect();
                return (
                    box.right > tour.left &&
                    box.left < tour.right &&
                    box.bottom > tour.top &&
                    box.top < tour.bottom
                );
            }).length;
        },
        { cards: CARD_LINKS, steps: TAB_STEPS }
    );
    expect(under).toBeGreaterThan(0);
    await page.locator(CARD_LINKS).first().focus();
    for (let step = 0; step < TAB_STEPS; step += 1) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate((cards) => {
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
                onCard: document.activeElement?.matches(cards) ?? false,
                overlaps,
            };
        }, CARD_LINKS);
        // Still on the cards, and none of it under the tour.
        expect(where.onCard, `focus after ${String(step + 1)} presses`).toBe(true);
        expect(where.overlaps, `focus after ${String(step + 1)} presses`).toBe(false);
    }
});
