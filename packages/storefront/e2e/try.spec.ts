import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Request, test } from '@playwright/test';

/*
 * A visitor's own catalog, through the worker registered for try/.
 *
 * The sample file the build writes is loaded as a visitor would load it,
 * by picking it, and searched with everything the demo has: suggestions,
 * a filter, a sort, a second page, a product and explain mode. Every
 * request the page makes is to its own origin, so nothing in the file
 * leaves the browser, and the demo beside it is untouched afterwards.
 */

test.skip(
    ({ isMobile }) => isMobile,
    'the desktop covers the page, and the store has its own phone spec'
);

const SAMPLE = new URL('../dist/try/sample-products.csv', import.meta.url).pathname;

const audit = async (page: Page) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
};

/** Every request a page makes, for checking where they went. */
const recordRequests = (page: Page): Request[] => {
    const requests: Request[] = [];
    page.on('request', (request) => requests.push(request));
    return requests;
};

const loadSample = async (page: Page) => {
    await page.goto('try/');
    await expect(
        page.getByRole('heading', { level: 1, name: 'Search your own products' })
    ).toBeVisible();
    await page.getByLabel('Choose a file').setInputFiles(SAMPLE);
    await expect(
        page.getByRole('heading', { level: 1, name: 'What is in sample-products.csv' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Search 200 products' }).click();
    await expect(page.getByText('your own catalog of 200 products')).toBeVisible();
};

test('searches a visitor’s file with everything the demo has, without it leaving the browser', async ({
    page,
}) => {
    const requests = recordRequests(page);
    await page.goto('try/');
    await expect(page.getByText('Nothing is uploaded')).toBeVisible();
    await audit(page);

    await page.getByLabel('Choose a file').setInputFiles(SAMPLE);
    await expect(
        page.getByRole('heading', { level: 1, name: 'What is in sample-products.csv' })
    ).toBeFocused();
    await expect(page.getByText('200 rows and 13 columns.')).toBeVisible();
    await audit(page);
    await page.getByRole('button', { name: 'Search 200 products' }).click();
    await expect(page.getByText('your own catalog of 200 products')).toBeVisible();

    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.fill('bag');
    await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible();
    await search.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "bag"');
    await audit(page);

    await page.getByRole('group', { name: 'Brand' }).getByRole('checkbox').first().check();
    await expect(page).toHaveURL(/brand=/);
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('price-asc');
    await expect(page).toHaveURL(/sort=price-asc/);

    // The store over a visitor's catalog opens on every product, which runs to pages.
    await page.goto('try/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All products');
    const pages = page.getByRole('navigation', { name: 'Pages' });
    await pages.getByRole('button', { name: 'Page 2', exact: true }).click();
    await expect(page).toHaveURL(/page=2/);

    await page.getByRole('button', { name: 'Explain ranking' }).click();
    await expect(page).toHaveURL(/explain/);
    const first = page.getByRole('list', { name: 'Products' }).getByRole('link').first();
    const name = (await first.locator('.card-name').textContent()) ?? '';
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);

    const file = readFileSync(SAMPLE, 'utf8');
    const origin = new URL(page.url()).origin;
    expect(
        requests.map((request) => new URL(request.url()).origin).filter((at) => at !== origin)
    ).toEqual([]);
    // The file's contents went to this page's own worker and nowhere else: the catalog,
    // and the clicks the store records on its products.
    const carrying = requests.filter((request) => (request.postData() ?? '').includes('SL-00'));
    const paths = carrying.map((request) => new URL(request.url()).pathname);
    expect(paths).toContain('/try/catalog');
    expect(paths.filter((path) => !path.startsWith('/try/'))).toEqual([]);
    expect(file).toContain('SL-00001');
});

test('the demo beside it keeps its own catalog once a visitor’s is loaded', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('shelflens.tour', 'seen'));
    await loadSample(page);
    await page.goto('./');
    await page.getByRole('combobox', { name: 'Search the store' }).fill('ridgeback');
    await page.getByRole('combobox', { name: 'Search the store' }).press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "ridgeback"');
    await expect(page.getByText('your own catalog')).toHaveCount(0);
});

test('removes a loaded catalog, and is back where a file is chosen', async ({ page }) => {
    await loadSample(page);
    await page.getByRole('button', { name: 'Remove your products' }).click();
    await expect(
        page.getByRole('heading', { level: 1, name: 'Search your own products' })
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole('heading', { level: 1, name: 'Search your own products' })
    ).toBeVisible();
});

test('says why a file past the cap is not loaded', async ({ page }) => {
    await page.goto('try/');
    const rows = Array.from({ length: 10_001 }, (_, index) => `Item ${index},$1.00`).join('\n');
    await page.getByLabel('Choose a file').setInputFiles({
        name: 'too-many.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`name,price\n${rows}\n`),
    });
    await expect(page.getByRole('alert')).toHaveText(
        'This file has 10,001 rows, and the page reads up to 10,000 products.'
    );
    await expect(page.getByRole('button', { name: /^Search/ })).toHaveCount(0);
});

test('takes the sample with one press', async ({ page }) => {
    await page.goto('try/');
    await page.getByRole('button', { name: 'Try it with a sample of 200 products' }).click();
    await expect(
        page.getByRole('heading', { level: 1, name: 'What is in sample-products.csv' })
    ).toBeVisible();
});
