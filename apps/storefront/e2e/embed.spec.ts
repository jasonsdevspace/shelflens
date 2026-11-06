import { expect, test } from './support.js';

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

for (const [colorScheme, fg, bg] of [
    ['light', 'rgb(26, 26, 26)', 'rgb(255, 255, 255)'],
    ['dark', 'rgb(240, 240, 240)', 'rgb(18, 18, 18)'],
] as const) {
    test(`draws its own colors under a host that sets a ${colorScheme} color scheme`, async ({
        page,
    }) => {
        // A host themes the widget by its color scheme alone, so the widget's colors have to
        // resolve from what its own sheet holds, with nothing of the store's on the page.
        await page.goto(HOST);
        await page.evaluate((scheme) => {
            document.documentElement.style.colorScheme = scheme;
        }, colorScheme);
        const search = page.getByRole('combobox', { name: 'Search the store' });
        await expect(search).toBeVisible();
        const frame = page.locator('.shelflens');
        expect(await frame.evaluate((el) => getComputedStyle(el).color)).toBe(fg);
        expect(await search.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(bg);
    });
}
