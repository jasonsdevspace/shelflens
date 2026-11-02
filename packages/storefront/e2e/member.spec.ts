import { amount, audit, expect, membersAndDiscount, test } from './support.js';

/*
 * What the viewer switch changes, and that a guest after a member is never served the member’s answer.
 *
 * Nothing is mocked. The page registers the worker, the worker fetches the
 * catalog and builds the store, and every request is answered inside the
 * browser. Each page is audited with axe as a shopper sees it.
 */

test('a member sees the product guests cannot, and pays less, from the same page', async ({
    page,
    request,
}) => {
    const { membersOnly, discounted } = await membersAndDiscount(request);

    await page.goto(`/?product=${membersOnly.sku}`);
    await expect(page.getByText(/There is no product/)).toBeVisible();
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(membersOnly.name);
    await expect(page.getByText('Members only')).toBeVisible();
    await audit(page);

    await page.goto('/?q=jacket');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect(page.locator('.results-aside')).toContainText(/^Shopping as a member/);
    await expect(page.locator('.card-member').first()).toHaveText('Member price');

    await page.goto(`/?product=${discounted.sku}`);
    const price = page.locator('.product-price');
    await expect(price).toBeVisible();
    const asGuest = amount(await price.textContent());
    await page.getByRole('combobox', { name: 'Shopping as' }).selectOption('member');
    await expect.poll(async () => amount(await price.textContent())).toBeLessThan(asGuest);
    // The product's own line, since the rail beneath it may carry member prices too.
    await expect(page.locator('.product-member')).toHaveText(/^Member price, .+ for guests$/);
});

test('a guest after a member sees the guest price and no product for members only', async ({
    page,
    request,
}) => {
    const { membersOnly, discounted } = await membersAndDiscount(request);
    const viewer = page.getByRole('combobox', { name: 'Shopping as' });
    const price = page.locator('.product-price');
    // Within the page, as a link does, so the viewer chosen stays chosen.
    const open = (sku: string) =>
        page.evaluate((path) => {
            window.history.pushState(null, '', path);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }, `/?product=${sku}`);
    const asGuest = discounted.price.guest.min / 100;

    // A member looks first: the products are first asked for as a member, so the
    // member's answers are the ones the page and the worker keep.
    await page.goto('/');
    await viewer.selectOption('member');
    await open(discounted.sku);
    await expect.poll(async () => amount(await price.textContent())).toBeLessThan(asGuest);
    await open(membersOnly.sku);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(membersOnly.name);

    // Then a guest in the same page, whose answers nothing has kept yet, so each is
    // asked of the worker, which must not hand over the member's.
    await viewer.selectOption('guest');
    await expect(page.getByText(/There is no product/)).toBeVisible();
    await open(discounted.sku);
    await expect.poll(async () => amount(await price.textContent())).toBe(asGuest);

    // And after a reload, with only what the worker kept left.
    await page.reload();
    await expect(viewer).toHaveValue('guest');
    await expect.poll(async () => amount(await price.textContent())).toBe(asGuest);
    await open(membersOnly.sku);
    await expect(page.getByText(/There is no product/)).toBeVisible();
});
