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
    const aside = page.getByText(/set aside the merchandising/);
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
    const rail = page.getByRole('region', { name: /Popular in|Viewed this/ });
    await expect(rail.getByRole('heading', { level: 2 })).toHaveText(/^Popular in /);
    await expect(rail.locator('.card-link[data-sku="SL-00001"]')).toHaveCount(0);
    await audit(page);

    await page.goto('/?product=SL-00002');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(rail.getByRole('heading', { level: 2 })).toHaveText('Viewed this, also viewed');
    await expect(rail.getByRole('link').first()).toContainText(firstName ?? '');
    await audit(page);
});
