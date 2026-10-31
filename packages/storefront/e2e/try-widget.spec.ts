import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Request, test } from '@playwright/test';

/*
 * The widget on a made-up store's page, over a visitor's own catalog. The
 * page sits under try/, embeds the widget the way a store would, and the
 * worker for try/ answers it. The file is made up, with products the demo's
 * catalog does not have, so a suggestion from it can only come from the
 * visitor's store. On a desktop and a phone, as the widget's own spec runs.
 */

const BENCHES = {
    name: 'benches.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
        'Title,Price\nCedar Bench,$95.00\nOak Bench,$80.00\nPine Bench,$60.00\nWalnut Bench,$120.00\n'
    ),
};

test.beforeEach(({ page }) =>
    page.addInitScript(() => localStorage.setItem('shelflens.tour', 'seen'))
);

const loadBenches = async (page: Page) => {
    await page.goto('try/');
    await page.getByLabel('Choose a file').setInputFiles(BENCHES);
    await page.getByRole('button', { name: 'Search 4 products' }).click();
    await expect(page.getByText('your own catalog of 4 products')).toBeVisible();
};

test('says to load a file first, with the way to do it, when nothing is loaded', async ({
    page,
}) => {
    await page.goto('try/widget/');
    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Load a file of your own products first');
    await expect(notice.getByRole('link', { name: 'Choose a file' })).toHaveAttribute(
        'href',
        /\/try\/$/
    );
});

test('searches the visitor’s own products from a store’s page, over its banner and out of its clipping box', async ({
    page,
}) => {
    await loadBenches(page);
    await page.getByRole('link', { name: 'See them on a store’s page' }).click();
    await expect(page).toHaveTitle("Your products on a store's page");
    const requests: Request[] = [];
    page.on('request', (request) => requests.push(request));

    const search = page.getByRole('combobox', { name: 'Search the store' });
    await expect(search).toBeVisible();
    await page.getByRole('button', { name: 'Count' }).click();
    await expect(page.getByText(/own React has counted 1/)).toBeVisible();

    await page.mouse.move(0, 0);
    await search.fill('cedar');
    const listbox = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(listbox.getByRole('option').first()).toContainText('Cedar Bench');

    const box = await listbox.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
        const atCenter = await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.id ?? '',
            { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        );
        expect(atCenter).toBe('shelflens-search');
        const clip = await page.locator('.host-clip').boundingBox();
        expect(clip).not.toBeNull();
        if (clip) expect(box.y + box.height).toBeGreaterThan(clip.y + clip.height);
    }
    // As on the widget's own host page, the list is a scrolling region the
    // combobox scrolls from the arrow keys, so that one rule is left out.
    const audit = await new AxeBuilder({ page })
        .disableRules(['scrollable-region-focusable'])
        .analyze();
    expect(audit.violations).toEqual([]);

    // Nothing leaves the browser: every request is to this origin, and every
    // question the box asks goes to the store for try/.
    const origin = new URL(page.url()).origin;
    expect(requests.every((request) => new URL(request.url()).origin === origin)).toBe(true);
    const asked = requests.filter((request) =>
        new URL(request.url()).pathname.endsWith('/graphql')
    );
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((request) => new URL(request.url()).pathname.includes('/try/'))).toBe(true);

    await search.press('Enter');
    await expect(page).toHaveURL(/\/try\/\?q=cedar/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "cedar"');

    await page.goto('try/widget/');
    await search.fill('walnut');
    await listbox.getByRole('option', { name: /Walnut Bench/ }).click();
    await expect(page).toHaveURL(/\/try\/\?product=/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Walnut Bench');
});
