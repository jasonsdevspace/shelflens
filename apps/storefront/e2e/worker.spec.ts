import { expect, test } from './support.js';

/*
 * The worker taking charge of a page it did not load, and a new build of it taking over a page
 * the last build answers.
 */

test('a page loaded past the worker is claimed by it and can search', async ({ page }) => {
    // Each load notes whether a worker answered it, before the page's own script runs.
    await page.addInitScript(() =>
        sessionStorage.setItem(
            'controlled at load',
            String(navigator.serviceWorker.controller !== null)
        )
    );
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await expect(search).toBeVisible();

    // A hard reload, which the browser loads from the network rather than through the worker.
    const session = await page.context().newCDPSession(page);
    await session.send('Page.reload', { ignoreCache: true });
    await session.detach();
    await page.waitForLoadState();
    expect(await page.evaluate(() => sessionStorage.getItem('controlled at load'))).toBe('false');

    await search.fill('jacket');
    await search.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
});

test('a new worker that takes over a page reloads it once, and the page searches after', async ({
    page,
}) => {
    await page.goto('/');
    await expect(page.getByRole('combobox', { name: 'Search the store' })).toBeVisible();
    let loads = 0;
    page.on('load', () => {
        loads += 1;
    });
    // The browser fetches a worker's script where no route reaches, so the next build is the
    // same script at another address, which the browser installs as a new worker for the scope.
    await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js?build=next', { type: 'module', scope: '/' });
    });

    await expect.poll(() => loads, { timeout: 15_000 }).toBe(1);
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.fill('jacket');
    await search.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    expect(loads).toBe(1);
});
