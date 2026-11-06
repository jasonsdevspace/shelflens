import { audit, expect, rulesPanel, test } from './support.js';

/*
 * Why each result ranked where it did, and a rule previewed, saved and given back.
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
    const aside = page.getByText(/sets aside the pins/);
    // The whole line, so the cafe racer sample's hide, which holds under any sort, is not in it.
    await expect(aside).toHaveText(
        'The sort “Price, low to high” sets aside the pins of “Featured jackets”.'
    );
    await audit(page);
    await page.getByRole('button', { name: 'Sort by relevance' }).click();
    const sort = page.getByRole('combobox', { name: 'Sort by' });
    await expect(sort).toHaveValue('relevance');
    await expect(sort).toBeFocused();
});

test('the category’s own sort names the boost it set aside, and the rule by its name', async ({
    page,
}) => {
    // The demo's boots rule only boosts a brand, which the category's own order does not read.
    await page.goto('/?q=boots&category=boots&sort=position');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByText(/sets aside the boost/)).toHaveText(
        'The sort “Featured” sets aside the boost of “Ridgeback boots first”.'
    );
    await audit(page);
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
    const notice = page.locator('.dk-callout', { hasText: 'Your edited rules are in effect' });
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

test('the rule form says a boost applies only under relevance', async ({ page, isMobile }) => {
    await page.goto('/?q=boots&category=boots&explain=1&rules=1');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    const panel = await rulesPanel(page, isMobile);
    await panel.getByRole('button', { name: /Ridgeback boots first/ }).click();
    await expect(panel.getByRole('combobox', { name: 'How much' })).toHaveAccessibleDescription(
        'A boost applies only under “Relevance”, where a search starts. Every other sort sets it aside, “Featured” included.'
    );
    await audit(page);
});
