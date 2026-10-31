import { expect, test } from '@playwright/test';

/*
 * The widget on a page the store does not serve, against the Node server.
 *
 * The page is served by host-server.mjs from an origin of its own, loads
 * the widget's file from the demo and asks the Node server, which the
 * suite started open to that origin alone. Every request crosses an
 * origin, which is what a store's real host page does.
 */

const HOST = 'http://127.0.0.1:4175/';
const DEMO = 'http://localhost:4173/';
const API = 'http://127.0.0.1:4174/graphql';

test('mounts on a page from another origin, gets suggestions from the server, and sends a search to the store', async ({
    page,
}) => {
    // The browser's preflight is its own affair, which a test never sees. The answer
    // that follows it says which origin the server allowed, and that is seen.
    const allowedFor: string[] = [];
    page.on('response', (response) => {
        const allowed = response.headers()['access-control-allow-origin'];
        if (response.url().startsWith(API) && allowed) allowedFor.push(allowed);
    });
    await page.goto(HOST);
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await expect(search).toBeVisible();
    await search.fill('boot');
    const listbox = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole('option').first()).toBeVisible();
    expect(allowedFor).toContain(new URL(HOST).origin);
    await search.press('Enter');
    await expect(page).toHaveURL(`${DEMO}?q=boot`);
});
