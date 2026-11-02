import type { Locator } from '@playwright/test';

import { audit, expect, test } from './support.js';

/*
 * A first visit and the page around the store: the worker taking over, the frame drawn before the script, a catalog that does not download, the pointer, and the explainer beside it.
 *
 * Nothing is mocked. The page registers the worker, the worker fetches the
 * catalog and builds the store, and every request is answered inside the
 * browser. Each page is audited with axe as a shopper sees it.
 */

test('a first visit reaches suggestions, results and a product, with no audit findings', async ({
    page,
}) => {
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await expect(search).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        /^All products, \d+ products$/
    );
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

test('says whose demo it is before anything else, and follows the theme the portfolio saved', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        /^All products, \d+ products$/
    );
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

test('the strip and the brand are in the page itself, and a browser without JavaScript is told what to do', async ({
    browser,
}) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    // Turning scripts off here leaves the browser parsing as though they ran, so the
    // line for a browser without JavaScript is checked in the markup.
    const noScript = page.locator('noscript');
    for (const path of ['/', '/try/']) {
        await page.goto(path);
        await expect(page.getByRole('navigation', { name: 'Portfolio' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'ShelfLens' })).toBeVisible();
        expect(await noScript.textContent()).toContain('ShelfLens needs JavaScript.');
    }
    await page.goto('/widget/');
    expect(await noScript.last().textContent()).toContain('The search box needs JavaScript.');
    await context.close();
});

test('a catalog that does not download ends the wait, and the store starts on a second try', async ({
    page,
    context,
}) => {
    // The worker fetches the catalog while it installs. Refusing it fails the install.
    await context.route('**/catalog.json', (route) => route.abort());
    await page.goto('/');
    const alert = page.getByRole('alert');
    await expect(
        alert.getByRole('heading', { level: 1, name: 'The store could not start' })
    ).toBeVisible();
    await expect(alert).toContainText('Check your connection and try again.');
    await expect(page.getByText('Preparing the store.')).toBeHidden();
    await audit(page);

    await context.unroute('**/catalog.json');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('combobox', { name: 'Search the store' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        /^All products, \d+ products$/
    );
});

test('whatever can be clicked shows the pointer, and a control that is off shows the arrow', async ({
    page,
}) => {
    await page.goto('/?category=shoes');
    const cursor = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).cursor);
    expect(await cursor(page.getByRole('combobox', { name: 'Sort by' }))).toBe('pointer');
    expect(await cursor(page.getByRole('combobox', { name: 'Shopping as' }))).toBe('pointer');
    const brand = page.getByRole('group', { name: 'Brand' });
    expect(await cursor(brand.locator('label').first())).toBe('pointer');
    const previous = page.getByRole('button', { name: 'Previous' });
    await expect(previous).toBeDisabled();
    expect(await cursor(previous)).toBe('default');
    expect(await cursor(page.getByRole('button', { name: 'Next' }))).toBe('pointer');
    // The page the visitor is on is not a link to anywhere, so it keeps the arrow.
    const pages = page.getByRole('navigation', { name: 'Pages' });
    expect(await cursor(pages.locator('[aria-current="page"]'))).toBe('default');
    expect(await cursor(pages.getByRole('button', { name: 'Page 2' }))).toBe('pointer');
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
        await expect(fresh.getByText(/There is no product/)).toBeVisible();
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
