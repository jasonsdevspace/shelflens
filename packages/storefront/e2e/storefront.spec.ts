import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/*
 * A cold first visit, through the service worker.
 *
 * Nothing is mocked. The page registers the worker, the worker fetches
 * the catalog and builds the store, and every request below is answered
 * inside the browser. Each page is audited with axe as a shopper sees it.
 */

test.skip(({ isMobile }) => isMobile, 'the phone has its own spec');

// The tour opens itself on a first visit. These are not that visit.
test.beforeEach(({ page }) =>
    page.addInitScript(() => localStorage.setItem('shelflens.tour', 'seen'))
);

const audit = async (page: Page) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
};

test('a first visit reaches suggestions, results and a product, with no audit findings', async ({
    page,
}) => {
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await expect(search).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All products');
    await audit(page);

    await search.fill('trail ru');
    const option = page.getByRole('option', { name: 'trail runner', exact: true });
    await expect(option).toBeVisible();
    await expect(search).toHaveAttribute('aria-expanded', 'true');
    await audit(page);

    await search.press('ArrowDown');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\?q=trail\+runner$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'results for "trail runner"'
    );
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveValue('relevance');

    const first = page.getByRole('list', { name: 'Products' }).getByRole('link').first();
    const name = (await first.locator('.card-name').textContent()) ?? '';
    await first.click();
    await expect(page).toHaveURL(/product=/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await audit(page);

    await page.getByRole('button', { name: 'Back to results' }).click();
    await expect(page).toHaveURL(/\?q=trail\+runner$/);
});

test('browsing a category sorts by position, and a facet narrows the results in the URL', async ({
    page,
}) => {
    await page.goto('/?category=shoes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shoes');
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveValue('position');

    const brand = page.getByRole('group', { name: 'Brand' }).getByRole('checkbox').first();
    const brandName = await brand.getAttribute('value');
    await brand.check();
    await expect(page).toHaveURL(
        new RegExp(`brand=${encodeURIComponent(brandName ?? '').replace(/%20/g, '\\+')}`)
    );
    await expect(brand).toBeChecked();
    await audit(page);

    await page.goBack();
    await expect(page).toHaveURL(/\?category=shoes$/);
    await expect(brand).not.toBeChecked();
});

interface ShippedCatalog {
    readonly products: readonly {
        readonly sku: string;
        readonly name: string;
        readonly visibleTo: readonly string[];
        readonly price: {
            readonly guest: { readonly min: number };
            readonly member: { readonly min: number };
        };
    }[];
}

const amount = (text: string | null) =>
    Number(/\d+(?:\.\d+)?/.exec((text ?? '').replace(/,/g, ''))?.[0]);

test('a member sees the product guests cannot, and pays less, from the same page', async ({
    page,
    request,
}) => {
    const catalog = (await (await request.get('/catalog.json')).json()) as ShippedCatalog;
    const membersOnly = catalog.products.find((p) => p.visibleTo.length === 1);
    const discounted = catalog.products.find((p) => p.price.member.min < p.price.guest.min);
    if (!membersOnly || !discounted) throw new Error('expected a hidden and a discounted product');

    await page.goto(`/?product=${membersOnly.sku}`);
    await expect(page.getByRole('alert')).toContainText('There is no product');
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(membersOnly.name);
    await expect(page.getByText('Members only')).toBeVisible();
    await audit(page);

    await page.goto('/?q=jacket');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect(page.getByText(/Shopping as a member/)).toBeVisible();
    await expect(page.locator('.card-member').first()).toHaveText('Member price');

    await page.goto(`/?product=${discounted.sku}`);
    const price = page.locator('.product-price');
    await expect(price).toBeVisible();
    const asGuest = amount(await price.textContent());
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect.poll(async () => amount(await price.textContent())).toBeLessThan(asGuest);
    // The product's own line, since the rail beneath it may carry member prices too.
    await expect(page.locator('.product-member')).toHaveText('Member price');
});

test('answers travel as named operations the browser may keep', async ({ page }) => {
    await page.goto('/?category=shoes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shoes');
    const answered = page.waitForResponse(
        (response) => response.url().includes('op=') && response.url().includes('v=')
    );
    await page.getByRole('group', { name: 'Brand' }).getByRole('checkbox').first().check();
    const response = await answered;
    expect(response.request().method()).toBe('GET');
    expect(response.headers()['cache-control']).toBe('public, max-age=300');
});

test('explain mode says why the featured jacket is first, and a price sort sets the rule aside', async ({
    page,
}) => {
    await page.goto('/?q=jacket&explain=1');
    // The explanation is a list inside each card, so the cards are the direct children.
    const cards = page.locator('.cards > .card');
    await expect(cards.first()).toContainText('Ridgeback Relaxed Puffer Jacket');
    await expect(cards.first().getByRole('list', { name: 'Why this is result 1' })).toContainText(
        'Pinned to the top by rule featured-jackets'
    );
    await expect(cards.nth(2).getByRole('list', { name: 'Why this is result 3' })).toContainText(
        '"jacket" matched "jacket" in the name'
    );
    await audit(page);

    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('price-asc');
    const aside = page.getByText(/set aside the pins and boosts/);
    await expect(aside).toBeVisible();
    await expect(aside).toContainText('featured-jackets');
});

test('nothing matched still shows a page: a shorter phrase with results, or a spelling', async ({
    page,
}) => {
    await page.goto('/?q=zzqx jacket');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
        'Showing results for "jacket" instead'
    );
    await expect(
        page.getByRole('list', { name: 'Results for "jacket"' }).getByRole('link').first()
    ).toBeVisible();
    await audit(page);

    await page.goto('/?q=jakkett');
    await page.getByRole('link', { name: 'jacket', exact: true }).click();
    await expect(page).toHaveURL(/\?q=jacket$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
});

test('says whose demo it is before anything else, and follows the theme the portfolio saved', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All products');
    const strip = page.getByRole('navigation', { name: 'Portfolio' });
    await expect(strip.getByRole('link', { name: 'A demo by Jason Poteet' })).toHaveAttribute(
        'href',
        'https://jasonsdevspace.com/#work'
    );
    await expect(strip.getByRole('link', { name: 'Source on GitHub' })).toBeVisible();
    // The first Tab from the top lands on the way back, before the storefront's own chrome.
    await page.keyboard.press('Tab');
    await expect(strip.getByRole('link', { name: 'A demo by Jason Poteet' })).toBeFocused();

    // The saved choice wins over the system, with no flash: the attribute is set before paint.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(18, 18, 18)');

    await expect(page.getByRole('contentinfo')).toContainText('portfolio project by Jason Poteet');
    await audit(page);
});

test('keeps its place: a search is announced, a product takes focus, and back lands on its card', async ({
    page,
}) => {
    await page.goto('/');
    const box = page.getByRole('combobox', { name: 'Search the store' });
    await box.fill('jacket');
    await box.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    await expect(box).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'results for "jacket"' })).toHaveCount(
        1
    );

    const first = page.getByRole('list', { name: 'Products' }).getByRole('link').first();
    const sku = await first.getAttribute('data-sku');
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.getByRole('button', { name: 'Back to results' }).click();
    await expect(page.locator(`.card-link[data-sku="${sku ?? ''}"]`)).toBeFocused();
    await audit(page);
});

test('what the shopper did reaches the worker, through a beacon, and outlives the page', async ({
    page,
}) => {
    await page.goto('/');
    const box = page.getByRole('combobox', { name: 'Search the store' });
    await box.fill('jacket');
    await box.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    // The cards of the page before stay, dimmed, until the answer lands.
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    const first = page.getByRole('list', { name: 'Products' }).getByRole('link').first();
    const sku = await first.getAttribute('data-sku');
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    // The page shares the worker's IndexedDB, so the test reads what arrived.
    const kept = () =>
        page.evaluate(
            () =>
                new Promise<{ kind: string; sku?: string; phrase?: string; position?: number }[]>(
                    (resolve, reject) => {
                        const opening = indexedDB.open('shelflens-events');
                        opening.onerror = () =>
                            reject(opening.error ?? new Error('could not open'));
                        opening.onsuccess = () => {
                            const db = opening.result;
                            if (!db.objectStoreNames.contains('events')) {
                                db.close();
                                resolve([]);
                                return;
                            }
                            const read = db.transaction('events').objectStore('events').getAll();
                            read.onsuccess = () => {
                                db.close();
                                resolve(read.result);
                            };
                            read.onerror = () => {
                                db.close();
                                reject(read.error ?? new Error('could not read'));
                            };
                        };
                    }
                )
        );
    await expect
        .poll(async () => (await kept()).map((event) => event.kind).sort(), { timeout: 10_000 })
        .toEqual(['click', 'search', 'view']);
    const events = await kept();
    expect(events.find((event) => event.kind === 'search')).toMatchObject({ phrase: 'jacket' });
    expect(events.find((event) => event.kind === 'click')).toMatchObject({
        phrase: 'jacket',
        sku,
        position: 1,
    });
    expect(events.find((event) => event.kind === 'view')).toMatchObject({ sku });
    for (const event of events) {
        expect(Object.keys(event).sort()).toEqual(
            ['at', 'id', 'kind', 'phrase', 'position', 'session', 'sku']
                .filter((key) => key in event)
                .sort()
        );
    }
});

test('a second product shows the first beside it, and the first shows its category', async ({
    page,
}) => {
    await page.goto('/?product=SL-00001');
    const first = page.getByRole('heading', { level: 1 });
    await expect(first).toBeFocused();
    const firstName = await first.textContent();
    const rail = page.getByRole('region', { name: /Top rated in|Viewed with/ });
    await expect(rail.getByRole('heading', { level: 2 })).toHaveText(/^Top rated in /);
    await expect(rail.locator('.card-link[data-sku="SL-00001"]')).toHaveCount(0);
    await audit(page);

    await page.goto('/?product=SL-00002');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(rail.getByRole('heading', { level: 2 })).toHaveText('Viewed with this product');
    await expect(rail.getByRole('link').first()).toContainText(firstName ?? '');
    await audit(page);
});

test('the explainer reads without the store, audits clean, and sends a reader in with the tour closed', async ({
    page,
    browser,
}) => {
    await page.goto('/about/');
    await expect(page).toHaveTitle('How ShelfLens works');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How ShelfLens works');
    await expect(page.getByRole('navigation', { name: 'Portfolio' })).toContainText('How it works');
    await audit(page);

    // The skip link is the first stop, and lands on the content.
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    // A story's link opens the store in its state, and the tour stays closed. In a
    // context of its own, with nothing marking the tour seen ahead of the page.
    const context = await browser.newContext();
    try {
        const fresh = await context.newPage();
        await fresh.goto('/about/');
        await fresh.getByRole('link', { name: /Open the product a guest cannot see/ }).click();
        await expect(fresh).toHaveURL(/\?product=SL-00008$/);
        await expect(fresh.getByRole('alert')).toContainText('There is no product');
        await expect(fresh.getByRole('button', { name: 'Tour' })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
        await fresh.goBack();
        await expect(fresh).toHaveURL(/\/about\/$/);
    } finally {
        await context.close();
    }
});

test('the store links to the explainer from its strip and its footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('combobox', { name: 'Search the store' })).toBeVisible();
    await page
        .getByRole('navigation', { name: 'Portfolio' })
        .getByRole('link', { name: 'How it works' })
        .click();
    await expect(page).toHaveURL(/\/about\/$/);
    await page.goBack();
    await page.getByRole('contentinfo').getByRole('link', { name: 'How it works' }).click();
    await expect(page).toHaveURL(/\/about\/$/);
});

test('what the shopper clicked rises on the next visit, says so in explain mode, and never passes a pin', async ({
    page,
}) => {
    await page.goto('/?q=jacket&explain=1');
    const cards = page.getByRole('list', { name: 'Products' }).getByRole('link');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    const before = await cards.evaluateAll((links) =>
        links.map((link) => link.getAttribute('data-sku'))
    );
    const pinned = before[0] ?? '';
    const last = before[before.length - 1] ?? '';
    await expect(page.locator(`.card:has([data-sku="${pinned}"]) .card-explain`)).toContainText(
        'Pinned to the top'
    );

    // Open the last result from three visits. A visit is the tab's id, so a new
    // one is given before each open, as three shoppers would have.
    for (let i = 0; i < 3; i += 1) {
        await page.evaluate(
            (visit) => sessionStorage.setItem('shelflens.session', visit),
            `visit-${i}`
        );
        await page.locator(`.card-link[data-sku="${last}"]`).click();
        await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
        await page.goBack();
        await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    }
    // Nothing moves within this visit.
    await expect(cards.last()).toHaveAttribute('data-sku', last);

    // The next visit folds the clicks in: the page waits for the worker's word
    // before it searches, so the very first answer is from the new store.
    await page.reload();
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    // What the worker holds, so a failure says which part did not happen.
    const held = await page.evaluate(async () => {
        const events = await new Promise<{ kind: string; sku?: string; session?: string }[]>(
            (resolve, reject) => {
                const opening = indexedDB.open('shelflens-events');
                opening.onerror = () => reject(opening.error ?? new Error('could not open'));
                opening.onsuccess = () => {
                    const db = opening.result;
                    if (!db.objectStoreNames.contains('events')) {
                        db.close();
                        resolve([]);
                        return;
                    }
                    const read = db.transaction('events').objectStore('events').getAll();
                    read.onsuccess = () => {
                        db.close();
                        resolve(read.result);
                    };
                    read.onerror = () => {
                        db.close();
                        reject(read.error ?? new Error('could not read'));
                    };
                };
            }
        );
        const response = await fetch('graphql?op=' + encodeURIComponent('x'), { method: 'GET' });
        return {
            clicks: events
                .filter((event) => event.kind === 'click')
                .map((event) => [event.sku, event.session]),
            status: response.status,
            version: response.headers.get('shelflens-store-version'),
        };
    });
    await expect(
        page.locator(`.card:has([data-sku="${last}"]) .card-explain`),
        JSON.stringify(held)
    ).toContainText('Clicked in 3 visits before');
    const after = await cards.evaluateAll((links) =>
        links.map((link) => link.getAttribute('data-sku'))
    );
    expect(after[0]).toBe(pinned);
    expect(after.indexOf(last)).toBeLessThan(before.indexOf(last));
    await audit(page);
});

test('a merchandiser previews a rule on the page, saves it as a new version, and gets the store back', async ({
    page,
}) => {
    await page.goto('/?q=jacket');
    const cards = page.getByRole('list', { name: 'Products' }).getByRole('link');
    const layout = page.locator('.results-layout');
    const order = () =>
        cards.evaluateAll((links) => links.map((link) => link.getAttribute('data-sku')));
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    const before = await order();
    const last = before[before.length - 1] ?? '';

    await page.getByRole('button', { name: 'Rules', exact: true }).click();
    await expect(page).toHaveURL(/explain=1&rules=1$/);
    const panel = page.getByRole('complementary', { name: 'Rules' });
    await expect(panel.getByRole('list', { name: 'Rules that apply' })).toContainText(
        'Featured jackets'
    );
    await panel.getByRole('button', { name: 'Add a rule' }).click();
    await panel.getByRole('textbox', { name: 'Name', exact: true }).fill('Last first');
    await panel.getByRole('combobox', { name: 'Product', exact: true }).fill(last);
    await expect(page.getByText('Previewing a draft')).toBeVisible();
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    const previewed = await order();
    expect(previewed.indexOf(last)).toBeLessThan(before.indexOf(last));
    await expect(page.locator(`.card:has([data-sku="${last}"]) .card-explain`)).toContainText(
        'Pinned to the top by rule'
    );
    await audit(page);

    await panel.getByRole('button', { name: 'Save rule' }).click();
    await expect(panel.getByRole('status')).toContainText('Rule saved. The store is now version');
    const notice = page.locator('.rules-notice');
    await expect(notice).toContainText('Your edited rules are in effect');
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    expect(await order()).toEqual(previewed);

    // The set is the worker's, so it outlives the page.
    await page.reload();
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    await expect(notice).toContainText('Your edited rules are in effect');
    expect(await order()).toEqual(previewed);
    await audit(page);

    await notice.getByRole('button', { name: 'Use the store\u2019s rules' }).click();
    await notice.getByRole('button', { name: 'Yes, discard' }).click();
    await expect(notice).toBeHidden();
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    expect(await order()).toEqual(before);
});

test('what this browser searched before is offered on the next visit, filtered as you type, and cleared from the box', async ({
    page,
}) => {
    await page.goto('/?q=jacket');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.fill('boot');
    await search.press('Enter');
    await expect(page).toHaveURL(/q=boot/);
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');

    await page.goto('/');
    await search.click();
    const recent = page.getByRole('listbox', { name: 'Recent searches' });
    await expect(recent).toBeVisible();
    await expect(recent.getByRole('option')).toHaveText(['boot', 'jacket']);
    await audit(page);
    await search.fill('j');
    await expect(recent.getByRole('option')).toHaveText(['jacket']);
    await search.fill('');
    await page.getByRole('button', { name: 'Clear recent searches' }).click();
    await expect(search).toBeFocused();
    await expect(
        page.getByRole('status').filter({ hasText: 'Recent searches cleared' })
    ).toBeVisible();
    await expect(recent).toBeHidden();
    await page.reload();
    await search.click();
    await expect(search).toHaveAttribute('aria-expanded', 'false');
});
