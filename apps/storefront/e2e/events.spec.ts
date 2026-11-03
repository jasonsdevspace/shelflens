import { audit, expect, keptEvents, test } from './support.js';

/*
 * What the shopper does reaches the worker, outlives the page, and lifts what was clicked on the next visit.
 */

test('what the shopper did reaches the worker, through a beacon, and outlives the page', async ({
    page,
}) => {
    await page.goto('/');
    const box = page.getByRole('combobox', { name: 'Search the store' });
    await box.fill('jacket');
    await box.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    // The cards of the page before stay, dimmed, until the answer lands.
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    const first = page.getByRole('list', { name: 'Products' }).getByRole('link').first();
    const sku = await first.getAttribute('data-sku');
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    // The page shares the worker's IndexedDB, so the test reads what arrived.
    const kept = () => keptEvents(page);
    await expect
        .poll(async () => (await kept()).map((event) => event.kind).sort(), { timeout: 10_000 })
        .toEqual(['click', 'search', 'view']);
    const events = await kept();
    expect(events.find((event) => event.kind === 'search')).toMatchObject({ phrase: 'jacket' });
    expect(events.find((event) => event.kind === 'click')).toMatchObject({
        phrase: 'jacket',
        sku,
        position: 1,
    });
    expect(events.find((event) => event.kind === 'view')).toMatchObject({ sku });
    for (const event of events) {
        expect(Object.keys(event).sort()).toEqual(
            ['at', 'id', 'kind', 'phrase', 'position', 'session', 'sku']
                .filter((key) => key in event)
                .sort()
        );
    }
});

test('what the shopper clicked rises on the next visit, says so in explain mode, and never passes a pin', async ({
    page,
}) => {
    await page.goto('/?q=jacket&explain=1');
    const cards = page.getByRole('list', { name: 'Products' }).getByRole('link');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    const before = await cards.evaluateAll((links) =>
        links.map((link) => link.getAttribute('data-sku'))
    );
    const pinned = before[0] ?? '';
    const last = before[before.length - 1] ?? '';
    await expect(page.locator(`.card:has([data-sku="${pinned}"]) .card-explain`)).toContainText(
        'Pinned to the top'
    );

    // Open the last result from three visits. A visit is the tab's id, so a new
    // one is given before each open, as three shoppers would have.
    for (let i = 0; i < 3; i += 1) {
        await page.evaluate(
            (visit) => sessionStorage.setItem('shelflens.session', visit),
            `visit-${i}`
        );
        await page.locator(`.card-link[data-sku="${last}"]`).click();
        await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
        await page.goBack();
        await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    }
    // Nothing moves within this visit.
    await expect(cards.last()).toHaveAttribute('data-sku', last);

    // The next visit folds the clicks in: the page waits for the worker's word
    // before it searches, so the very first answer is from the new store.
    await page.reload();
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    // What the worker holds, so a failure says which part did not happen.
    const events = await keptEvents(page);
    const asked = await page.evaluate(async () => {
        const response = await fetch('graphql?op=' + encodeURIComponent('x'), { method: 'GET' });
        return {
            status: response.status,
            version: response.headers.get('shelflens-store-version'),
        };
    });
    const held = {
        clicks: events
            .filter((event) => event.kind === 'click')
            .map((event) => [event.sku, event.session]),
        ...asked,
    };
    await expect(
        page.locator(`.card:has([data-sku="${last}"]) .card-explain`),
        JSON.stringify(held)
    ).toContainText('Opened from the results in 3 earlier visits');
    const after = await cards.evaluateAll((links) =>
        links.map((link) => link.getAttribute('data-sku'))
    );
    expect(after[0]).toBe(pinned);
    expect(after.indexOf(last)).toBeLessThan(before.indexOf(last));
    await audit(page);
});
