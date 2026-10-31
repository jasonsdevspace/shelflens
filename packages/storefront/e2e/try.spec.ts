import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type Request, test } from '@playwright/test';

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

test('puts a wrong guess right before searching, and the store shows what was chosen', async ({
    page,
}) => {
    await page.goto('try/');
    await page.getByLabel('Choose a file').setInputFiles({
        name: 'costs.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
            'Title,Cost,Retail\nCedar Bench,$40.00,$95.00\nOak Stool,$25.00,$60.00\n'
        ),
    });
    await expect(page.getByLabel('Price', { exact: true })).toHaveValue('Cost');
    // Each guess is a dropdown and each column a checkbox, and both show the pointer.
    const cursor = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).cursor);
    expect(await cursor(page.getByLabel('Price', { exact: true }))).toBe('pointer');
    expect(await cursor(page.locator('.try-search-only label').first())).toBe('pointer');
    const preview = page.getByRole('list', { name: 'Preview' });
    await expect(preview).toContainText('$40');
    await page.getByLabel('Price', { exact: true }).selectOption('Retail');
    await expect(preview).toContainText('$95');
    await expect(preview).not.toContainText('$40');
    await audit(page);
    await page.getByRole('button', { name: 'Search 2 products' }).click();
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.fill('bench');
    await search.press('Enter');
    await expect(page.getByRole('list', { name: 'Products' })).toContainText('$95');
});

/** Four products of a made-up file, which the demo's catalog does not have, so the store searched can only be the visitor's. */
const BENCHES = {
    name: 'benches.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
        'Title,Price\nCedar Bench,$95.00\nOak Bench,$80.00\nPine Bench,$60.00\nWalnut Bench,$120.00\n'
    ),
};

/** The same benches with one more, a different file, so loading it replaces the products. */
const MORE_BENCHES = {
    ...BENCHES,
    name: 'more-benches.csv',
    buffer: Buffer.from(`${BENCHES.buffer.toString()}Birch Bench,$70.00\n`),
};

const loadBenches = async (page: Page) => {
    await page.goto('try/');
    await page.getByLabel('Choose a file').setInputFiles(BENCHES);
    await page.getByRole('button', { name: 'Search 4 products' }).click();
    await expect(page.getByText('your own catalog of 4 products')).toBeVisible();
};

test('a visitor pins their own product, sees why it ranked, keeps it across a visit, and is asked before a new file takes it', async ({
    page,
}) => {
    await loadBenches(page);
    await page.goto('try/?q=bench&explain=1');
    const cards = page.getByRole('list', { name: 'Products' }).getByRole('link');
    const layout = page.locator('.results-layout');
    const order = () =>
        cards.evaluateAll((links) => links.map((link) => link.getAttribute('data-sku')));
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    await expect.poll(order).toHaveLength(4);
    const before = await order();
    const last = before[before.length - 1] ?? '';

    await page.getByRole('button', { name: 'Rules', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Rules' });
    await panel.getByRole('button', { name: 'Add a rule' }).click();
    await panel.getByRole('textbox', { name: 'Name', exact: true }).fill('My bench first');
    await panel.getByRole('combobox', { name: 'Product', exact: true }).fill(last);
    await expect(page.getByText('Previewing a draft')).toBeVisible();
    await expect(page.locator(`.card:has([data-sku="${last}"]) .card-explain`)).toContainText(
        'Pinned to the top by rule'
    );
    await audit(page);

    await panel.getByRole('button', { name: 'Save rule' }).click();
    await expect(panel.getByRole('status')).toContainText('Rule saved. The store is now version');
    await expect.poll(async () => (await order())[0]).toBe(last);

    // The visitor's rules are kept by the worker for try/, so they outlive the
    // page, and the demo's store, asked directly, has none of its own edited.
    await page.reload();
    await expect.poll(async () => (await order())[0]).toBe(last);
    await page.goto('./');
    await expect(page.getByRole('combobox', { name: 'Search the store' })).toBeVisible();
    const demoRules = await page.evaluate(async () => {
        const response = await fetch('rules');
        return ((await response.json()) as { edited: boolean }).edited;
    });
    expect(demoRules).toBe(false);

    // Another file replaces these products and their rules, so the page asks
    // when it would load one, and keeping them goes back to them.
    await page.goto('try/?q=bench');
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await page.getByLabel('Choose a file').setInputFiles(MORE_BENCHES);
    await page.getByRole('button', { name: 'Search 5 products' }).click();
    await expect(page.getByText(/Searching this file replaces your products/)).toBeVisible();
    await audit(page);
    await page.getByRole('button', { name: 'Keep my products' }).click();
    await expect(page.getByText('your own catalog of 4 products')).toBeVisible();
    await expect(page).toHaveURL(/try\/\?q=bench$/);
    await expect.poll(async () => (await order())[0]).toBe(last);

    await page.getByRole('button', { name: 'Choose another file' }).click();
    await page.getByLabel('Choose a file').setInputFiles(MORE_BENCHES);
    await page.getByRole('button', { name: 'Search 5 products' }).click();
    await page.getByRole('button', { name: 'Yes, search this file' }).click();
    await expect(page.getByText('your own catalog of 5 products')).toBeVisible();
    await page.goto('try/?q=bench');
    await expect.poll(order).toHaveLength(5);
    expect((await order())[0]).not.toBe(last);
    await expect(page.locator('.rules-notice')).toBeHidden();
});

test('discarding a visitor’s rules gives back the order the engine chose', async ({ page }) => {
    await loadBenches(page);
    await page.goto('try/?q=bench');
    const cards = page.getByRole('list', { name: 'Products' }).getByRole('link');
    const layout = page.locator('.results-layout');
    const order = () =>
        cards.evaluateAll((links) => links.map((link) => link.getAttribute('data-sku')));
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    const before = await order();
    const last = before[before.length - 1] ?? '';
    await page.getByRole('button', { name: 'Rules', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Rules' });
    await panel.getByRole('button', { name: 'Add a rule' }).click();
    await panel.getByRole('textbox', { name: 'Name', exact: true }).fill('My bench first');
    await panel.getByRole('combobox', { name: 'Product', exact: true }).fill(last);
    await panel.getByRole('button', { name: 'Save rule' }).click();
    await expect(panel.getByRole('status')).toContainText('Rule saved');
    const notice = page.locator('.rules-notice');
    await notice.getByRole('button', { name: 'Discard your rules' }).click();
    await notice.getByRole('button', { name: 'Yes, discard' }).click();
    await expect(notice).toBeHidden();
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    expect(await order()).toEqual(before);
});
