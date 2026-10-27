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
