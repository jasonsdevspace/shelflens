import { audit, expect, test } from './support.js';

/*
 * Why each result ranked where it did, and a rule previewed, saved and given back.
 *
 * Nothing is mocked. The page registers the worker, the worker fetches the
 * catalog and builds the store, and every request is answered inside the
 * browser. Each page is audited with axe as a shopper sees it.
 */

test('explain mode says why the featured jacket is first, and a price sort sets the rule aside', async ({
    page,
}) => {
    await page.goto('/?q=jacket&explain=1');
    // The explanation is a list inside each card, so the cards are the direct children.
    const cards = page.locator('.cards > .card');
    await expect(cards.first()).toContainText('Ridgeback Relaxed Puffer Jacket');
    await expect(cards.first().getByRole('list', { name: 'Why this is result 1' })).toContainText(
        'Pinned to the top by rule featured-jackets'
    );
    await expect(cards.nth(2).getByRole('list', { name: 'Why this is result 3' })).toContainText(
        '"jacket" matched "jacket" in the name'
    );
    await audit(page);

    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('price-asc');
    const aside = page.getByText(/sets aside the pins, boosts and buries/);
    await expect(aside).toBeVisible();
    await expect(aside).toContainText('featured-jackets');
    await expect(aside).toContainText('Choose “Relevance” under “Sort by”');
    // The cafe racer sample stays hidden: a hide holds under any sort, and is not set aside.
    await expect(aside).not.toContainText('racer-sample');
});

test('a merchandiser previews a rule on the page, saves it as a new version, and gets the store back', async ({
    page,
}) => {
    await page.goto('/?q=jacket');
    const cards = page.getByRole('list', { name: 'Products' }).getByRole('link');
    const layout = page.locator('.results-layout');
    const order = () =>
        cards.evaluateAll((links) => links.map((link) => link.getAttribute('data-sku')));
    await expect(layout).toHaveAttribute('aria-busy', 'false');
    const before = await order();
    const last = before[before.length - 1] ?? '';

    await page.getByRole('button', { name: 'Rules', exact: true }).click();
    await expect(page).toHaveURL(/explain=1&rules=1$/);
    const panel = page.getByRole('complementary', { name: 'Rules' });
    await expect(panel.getByRole('list', { name: 'Rules that apply' })).toContainText(
        'Featured jackets'
    );
    await panel.getByRole('button', { name: 'Add a rule' }).click();
    await panel.getByRole('textbox', { name: 'Name', exact: true }).fill('Last first');
    await panel.getByRole('combobox', { name: 'Product', exact: true }).fill(last);
    await expect(page.getByText('Previewing a draft')).toBeVisible();
    // The order is read until the preview has moved the product up, since the page
    // can read as settled a moment before the preview's answer has been asked for.
    // The order kept is the one that passed, a whole list with the product moved up, not
    // a list read again a moment later or one in the middle of being drawn.
    let previewed: (string | null)[] = [];
    await expect
        .poll(async () => {
            previewed = await order();
            const moved = previewed.indexOf(last);
            return previewed.length === before.length && moved >= 0 && moved < before.indexOf(last);
        })
        .toBe(true);
    await expect(page.locator(`.card:has([data-sku="${last}"]) .card-explain`)).toContainText(
        'Pinned to the top by rule'
    );
    await audit(page);

    await panel.getByRole('button', { name: 'Save rule' }).click();
    await expect(panel.getByRole('status')).toContainText('Rule saved. The store is now version');
    const notice = page.locator('.rules-notice');
    await expect(notice).toContainText('Your edited rules are in effect');
    await expect.poll(order).toEqual(previewed);

    // The set is the worker's, so it outlives the page.
    await page.reload();
    await expect(notice).toContainText('Your edited rules are in effect');
    await expect.poll(order).toEqual(previewed);
    await audit(page);

    await notice.getByRole('button', { name: 'Discard your rules' }).click();
    await notice.getByRole('button', { name: 'Yes, discard' }).click();
    await expect(notice).toBeHidden();
    await expect.poll(order).toEqual(before);
});
