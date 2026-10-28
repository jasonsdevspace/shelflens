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
    await audit(page);

    await page.goto(`/?product=${discounted.sku}`);
    const price = page.locator('.product-price');
    await expect(price).toBeVisible();
    const asGuest = amount(await price.textContent());
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect.poll(async () => amount(await price.textContent())).toBeLessThan(asGuest);
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
