import { STOPS } from '../src/tour/stops.js';
import { audit, expect, type Page, setTextSize, settle, test } from './support.js';

/*
 * The same storefront on a phone: the facets are a drawer, and the popover
 * takes the width of the screen.
 */

test('the facets open in a drawer, narrow the results, and close back to them', async ({
    page,
}) => {
    await page.goto('/?category=shoes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Shoes, \d+ products$/);
    await expect(page.getByRole('group', { name: 'Brand' })).toBeHidden();

    const open = page.getByRole('button', { name: 'Filters' });
    // The heading comes first, then the button, on its own line under it.
    const headingBox = await page.getByRole('heading', { level: 1 }).boundingBox();
    const openBox = await open.boundingBox();
    if (!headingBox || !openBox) throw new Error('expected the heading and the button on screen');
    expect(openBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    await open.click();
    const drawer = page.getByRole('dialog', { name: 'Filters' });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
    // Outside the results, so their dimming while the next answer loads never reaches it.
    expect(await drawer.evaluate((panel) => panel.closest('.results-main'))).toBeNull();

    const brand = drawer.getByRole('group', { name: 'Brand' }).getByRole('checkbox').first();
    await brand.check();
    await expect(page).toHaveURL(/brand=/);
    await expect(drawer.getByRole('button', { name: /Show \d+ results/ })).toBeVisible();
    await audit(page);

    await drawer.getByRole('button', { name: /Show \d+ results/ }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: /Filters/ })).toBeFocused();
    await expect(page.getByRole('button', { name: /Filters/ })).toContainText('1');
});

test('the popover fits the screen and works from the keyboard', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.tap();
    await search.fill('boot');
    const listbox = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(listbox).toBeVisible();
    const box = await listbox.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        // The search box shares its row with the brand, but the list takes the screen's width,
        // so a product's name, price and swatch have room.
        const field = await search.boundingBox();
        expect(field?.width ?? 0).toBeLessThan(320);
        expect(box.width).toBeGreaterThan(viewport.width - 40);
    }
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\?q=/);
});

test('the explainer fits a phone, with its steps stacked and nothing scrolling sideways', async ({
    page,
}) => {
    await page.goto('/about/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How ShelfLens works');
    const steps = page.locator('.flow li');
    await expect(steps).toHaveCount(5);
    const first = await steps.nth(0).boundingBox();
    const second = await steps.nth(1).boundingBox();
    expect(second?.y ?? 0).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0));
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await audit(page);
});

test('the recent searches fit the screen and audit clean', async ({ page }) => {
    await page.goto('/?q=jacket');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.tap();
    const recent = page.getByRole('listbox', { name: 'Recent searches' });
    await expect(recent).toBeVisible();
    const box = await page.locator('.searchbox-popover').boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    await audit(page);
});

test('a rule half typed in the drawer survives the device turning', async ({ page }) => {
    await page.goto('/?q=jacket&explain=1&rules=1');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: 'Edit rules' }).tap();
    const drawer = page.getByRole('dialog', { name: 'Rules' });
    await drawer.getByRole('button', { name: 'Add a rule' }).tap();
    await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill('Last first');
    // Turned sideways, the page is wider than a phone, and the panel is a column.
    await page.setViewportSize({ width: 1024, height: 600 });
    const panel = page.getByRole('complementary', { name: 'Rules' });
    await expect(panel.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
        'Last first'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Edit rules' }).tap();
    await expect(drawer.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
        'Last first'
    );
});

test('Escape closes the drawer after a choice takes away the button that had focus', async ({
    page,
}) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Filters' }).click();
    const drawer = page.getByRole('dialog', { name: 'Filters' });
    // A category's button gives way to its children once chosen.
    await drawer.getByRole('group', { name: 'Category' }).getByRole('button').first().click();
    await expect(page).toHaveURL(/category=/);
    await expect(drawer.getByRole('heading', { name: 'Filters' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: /Filters/ })).toBeFocused();
});

test('on a phone the product name has the width of the page, under its swatch', async ({
    page,
}) => {
    await page.goto('/?product=SL-00145');
    const name = page.getByRole('heading', { level: 1 });
    await expect(name).toBeFocused();
    const swatch = await page.locator('.product-head .swatch').boundingBox();
    const box = await name.boundingBox();
    if (!swatch || !box) throw new Error('expected the swatch and the name');
    expect(box.y).toBeGreaterThanOrEqual(swatch.y + swatch.height);
    expect(await name.evaluate((el) => getComputedStyle(el).fontSize)).toBe('24px');
    // The name wraps once at most.
    const line = Number.parseFloat(await name.evaluate((el) => getComputedStyle(el).lineHeight));
    expect(box.height).toBeLessThanOrEqual(line * 2 + 1);
});

test.describe('on a first visit', () => {
    // The tour offers itself in a short bar over the bottom of the screen, and opens as a sheet on Start.
    test.use({ tourSeen: false });

    /** Tabs through the cards, checking focus stays on them and above whatever the tour draws. */
    const tabClearOfTour = async (page: Page) => {
        const cards = page.locator('.cards > .card a');
        await expect(cards.first()).toBeVisible();
        await cards.first().focus();
        for (let step = 0; step < 6; step += 1) {
            await page.keyboard.press('Tab');
            const where = await page.evaluate(() => ({
                onCard: document.activeElement?.matches('.cards > .card a') ?? false,
                bottom: document.activeElement?.getBoundingClientRect().bottom ?? Infinity,
                tour: document.querySelector('.tour')?.getBoundingClientRect().top ?? 0,
            }));
            // Still on the cards, and above the tour.
            expect(where.onCard, `focus after ${String(step + 1)} presses`).toBe(true);
            expect(where.bottom, `focus after ${String(step + 1)} presses`).toBeLessThanOrEqual(
                where.tour
            );
        }
    };

    test('offers the tour in a short bar, and opens the sheet on Start', async ({ page }) => {
        await page.goto('/');
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await expect(tour).toContainText('A tour of what to try');
        await expect(tour.getByRole('button', { name: 'Next' })).toHaveCount(0);
        await audit(page);
        await tour.getByRole('button', { name: 'Start' }).click();
        await expect(tour).toContainText('Stop 1 of');
        await expect(tour.getByRole('button', { name: 'Close' })).toBeFocused();
    });

    /** Where the sheet and its buttons are drawn, at the stop the tour is on. */
    const drawn = (page: Page) =>
        page.evaluate(() => {
            const scroller = document.querySelector('.tour');
            const nav = document.querySelector('.tour-nav');
            const step = document.querySelector('.tour-steps .button:last-child');
            const previous = document.querySelector('.tour-steps .button:first-child');
            if (!scroller || !nav || !step || !previous) {
                throw new Error('expected the sheet and its buttons');
            }
            const sheet = scroller.getBoundingClientRect();
            const buttons = nav.getBoundingClientRect();
            return {
                height: Math.round(sheet.height),
                // Half the screen, or 28rem where that is less.
                cap: Math.min(
                    28 * parseFloat(getComputedStyle(document.documentElement).fontSize),
                    innerHeight / 2
                ),
                buttonsFromFoot: Math.round(innerHeight - buttons.top),
                nextRight: Math.round(step.getBoundingClientRect().right),
                previousLeft: Math.round(previous.getBoundingClientRect().left),
                sideways: scroller.scrollWidth > scroller.clientWidth,
                gapUnderButtons: Math.round(sheet.bottom - buttons.bottom),
                scrolled: scroller.scrollTop,
                pinned: getComputedStyle(nav).position === 'sticky',
            };
        });

    /** Starts the tour from the bar, and steps through every stop, measuring each. */
    const walk = async (
        page: Page,
        each: (at: Awaited<ReturnType<typeof drawn>>, stop: number) => void | Promise<void>
    ) => {
        await page.goto('/');
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await tour.getByRole('button', { name: 'Start' }).click();
        for (let stop = 1; stop <= STOPS.length; stop += 1) {
            await expect(tour).toContainText(`Stop ${String(stop)} of`);
            await each(await drawn(page), stop);
            if (stop < STOPS.length) await tour.getByRole('button', { name: 'Next' }).click();
        }
    };

    test('the sheet is as tall as its stop, and its buttons hold their place from stop to stop', async ({
        page,
    }) => {
        const heights = new Set<number>();
        const feet = new Set<number>();
        const rights = new Set<number>();
        const lefts = new Set<number>();
        await walk(page, (at, stop) => {
            heights.add(at.height);
            feet.add(at.buttonsFromFoot);
            rights.add(at.nextRight);
            lefts.add(at.previousLeft);
            expect(at.height, `the sheet at stop ${String(stop)}`).toBeLessThanOrEqual(at.cap + 1);
            expect(at.pinned, `the buttons at stop ${String(stop)}`).toBe(true);
        });
        expect(heights.size, 'the heights the sheet was drawn at').toBeGreaterThan(1);
        expect([...feet], 'where the buttons stand above the foot of the screen').toHaveLength(1);
        expect([...rights], 'where Next, then Finish, ends').toHaveLength(1);
        expect([...lefts], 'where Previous starts').toHaveLength(1);
    });

    test('never shifts a page scrolled to its end as the sheet changes height', async ({
        page,
    }) => {
        await page.goto('/?q=jacket');
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await tour.getByRole('button', { name: 'Start' }).click();
        for (let stop = 1; stop < STOPS.length; stop += 1) {
            await expect(tour).toContainText(`Stop ${String(stop)} of`);
            const end = await page.evaluate(() => {
                window.scrollTo(0, document.documentElement.scrollHeight);
                return window.scrollY;
            });
            await tour.getByRole('button', { name: 'Next' }).click();
            await expect(tour).toContainText(`Stop ${String(stop + 1)} of`);
            expect(await page.evaluate(() => window.scrollY), `after stop ${String(stop)}`).toBe(
                end
            );
        }
    });

    test('on the narrowest phone nothing scrolls sideways or shows under the buttons, and each stop opens at its top', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await walk(page, async (at, stop) => {
            expect(at.sideways, `sideways at stop ${String(stop)}`).toBe(false);
            expect(at.gapUnderButtons, `under the buttons at stop ${String(stop)}`).toBe(0);
            expect(at.scrolled, `scrolled at stop ${String(stop)}`).toBe(0);
            // Scrolled to its end, so the next stop has a place to be carried to.
            await page.evaluate(() => {
                const sheet = document.querySelector('.tour');
                if (sheet) sheet.scrollTop = sheet.scrollHeight;
            });
        });
    });

    test('offers the tour on one row on the narrowest phone', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto('/');
        const bar = page.getByRole('complementary', { name: 'Tour' });
        await expect(bar).toContainText('A tour of what to try');
        const row = await page.evaluate(() => {
            const text = document.querySelector('.tour-offer-text');
            const answers = [...document.querySelectorAll('.tour-offer-actions .button')];
            if (!text || answers.length !== 2) throw new Error('expected the text and two answers');
            const [start, decline] = answers.map((answer) => answer.getBoundingClientRect());
            return {
                startTop: start?.top,
                declineTop: decline?.top,
                textRight: text.getBoundingClientRect().right,
                startLeft: start?.left ?? 0,
            };
        });
        // Start and Not now on one line, beside the text rather than under it.
        expect(row.startTop).toBe(row.declineTop);
        expect(row.textRight).toBeLessThanOrEqual(row.startLeft);
    });

    test('at twice the text size the page is never zoomed out, and every control of the top bar and the tour can be tapped', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto('/?q=jacket');
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await expect(tour).toContainText('A tour of what to try');
        // A visitor's own larger text. The setting holds for the page as loaded, and a phone's
        // browser fits the page to the screen again as it reflows, zooming out if it is wider.
        await setTextSize(page, 2);
        await settle(page);
        const zoom = () =>
            page.evaluate(() => ({ scale: window.visualViewport?.scale ?? 1, width: innerWidth }));
        expect(await zoom()).toEqual({ scale: 1, width: 320 });
        // A trial tap checks each is in view and that nothing else takes the tap at its center.
        const tappable = [
            page.getByRole('combobox', { name: 'Shopping as' }),
            page.getByRole('button', { name: 'Tour' }),
            tour.getByRole('button', { name: 'Not now' }),
            tour.getByRole('button', { name: 'Start' }),
        ];
        for (const control of tappable) await control.tap({ trial: true });
        await tour.getByRole('button', { name: 'Start' }).tap();
        await expect(tour).toContainText('Stop 1 of');
        expect(await zoom()).toEqual({ scale: 1, width: 320 });
        await tour.getByRole('button', { name: 'Close' }).tap({ trial: true });
        await tour.getByRole('link', { name: 'Try it' }).tap({ trial: true });
        await tour.getByRole('button', { name: 'Next' }).tap({ trial: true });
        // Previous is off at the first stop, so it is checked for being on screen instead.
        const previous = await tour.getByRole('button', { name: 'Previous' }).boundingBox();
        const sheet = await tour.boundingBox();
        expect(
            previous !== null &&
                sheet !== null &&
                previous.x >= 0 &&
                previous.x + previous.width <= 320 &&
                previous.y >= sheet.y &&
                previous.y + previous.height <= Math.min(640, sheet.y + sheet.height),
            'Previous is wholly on screen and inside the sheet'
        ).toBe(true);
    });

    test('Not now puts the bar away for good', async ({ page }) => {
        await page.goto('/');
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await tour.getByRole('button', { name: 'Not now' }).click();
        await expect(tour).toBeHidden();
        await page.reload();
        await expect(page.getByRole('combobox', { name: 'Search the store' })).toBeVisible();
        await expect(tour).toBeHidden();
    });

    test('neither the bar nor the sheet ever covers a card that focus reaches', async ({
        page,
    }) => {
        await page.goto('?category=clothing');
        const tour = page.getByRole('complementary', { name: 'Tour' });
        await expect(tour).toContainText('A tour of what to try');
        await tabClearOfTour(page);
        await tour.getByRole('button', { name: 'Start' }).click();
        await expect(tour).toContainText('Stop 1 of');
        await tabClearOfTour(page);
    });
});
