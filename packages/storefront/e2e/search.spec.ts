import { audit, expect, test } from './support.js';

/*
 * Finding things: a category, every sort, a search that finds nothing, what was searched before, and the named operations the browser may keep.
 *
 * Nothing is mocked. The page registers the worker, the worker fetches the
 * catalog and builds the store, and every request is answered inside the
 * browser. Each page is audited with axe as a shopper sees it.
 */

test('browsing a category sorts by position, and a facet narrows the results in the URL', async ({
    page,
}) => {
    await page.goto('/?category=shoes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Shoes, \d+ products$/);
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

test('every sort answers, and the results stay', async ({ page }) => {
    await page.goto('/?q=jacket');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText('results for "jacket"');
    const sort = page.getByRole('combobox', { name: 'Sort by' });
    const options = await sort
        .locator('option')
        .evaluateAll((all) => all.map((option) => (option as HTMLOptionElement).value));
    for (const option of options) {
        await sort.selectOption(option);
        await expect(page).toHaveURL(new RegExp(`sort=${option}`));
        await expect(heading).toContainText('results for "jacket"');
        await expect(page.getByRole('alert')).toHaveCount(0);
    }
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

test('answers travel as named operations the browser may keep', async ({ page }) => {
    await page.goto('/?category=shoes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Shoes, \d+ products$/);
    const answered = page.waitForResponse(
        (response) => response.url().includes('op=') && response.url().includes('v=')
    );
    await page.getByRole('group', { name: 'Brand' }).getByRole('checkbox').first().check();
    const response = await answered;
    expect(response.request().method()).toBe('GET');
    expect(response.headers()['cache-control']).toBe('public, max-age=300');
});
