import { audit, expect, type ShippedCatalog, test } from './support.js';

/*
 * A product over its results: focus, the way back, the rail, and the shape of the page.
 *
 * Nothing is mocked. The page registers the worker, the worker fetches the
 * catalog and builds the store, and every request is answered inside the
 * browser. Each page is audited with axe as a shopper sees it.
 */

test('keeps its place: a search is announced, a product takes focus, and back lands on its card', async ({
    page,
}) => {
    await page.goto('/');
    const box = page.getByRole('combobox', { name: 'Search the store' });
    await box.fill('jacket');
    await box.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    await expect(box).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'results for "jacket"' })).toHaveCount(
        1
    );

    const first = page.getByRole('list', { name: 'Products' }).getByRole('link').first();
    const sku = await first.getAttribute('data-sku');
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.getByRole('button', { name: 'Back to results' }).click();
    await expect(page.locator(`.card-link[data-sku="${sku ?? ''}"]`)).toBeFocused();
    await audit(page);
});

test('browser Back along the rail shows each product from its heading', async ({ page }) => {
    // Where the focused heading sits once the page has settled. The browser's own restore
    // comes after focus and the product's answer, with no event of its own, so the test
    // waits for the last thing the page asks for, the rail, and then watches the heading
    // frame by frame until it has held still for thirty.
    const settledTop = () =>
        page.evaluate(
            () =>
                new Promise<number>((resolve) => {
                    // The heading's own place, which a scroll and a shift in layout both move.
                    const top = () => document.activeElement?.getBoundingClientRect().top ?? NaN;
                    let last = top();
                    let still = 0;
                    const watch = () => {
                        const now = top();
                        still = now === last ? still + 1 : 0;
                        last = now;
                        if (still >= 30) {
                            resolve(now);
                            return;
                        }
                        requestAnimationFrame(watch);
                    };
                    requestAnimationFrame(watch);
                })
        );
    await page.goto('/?q=jacket&page=2');
    await page.getByRole('list', { name: 'Products' }).getByRole('link').nth(4).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    const rail = page.getByRole('region', { name: /Viewed with|Most rated in/ });
    for (let step = 0; step < 2; step += 1) {
        // The shopper reads down to the rail before choosing from it.
        const next = rail.getByRole('link').nth(1);
        const name = (await next.locator('.card-name').textContent()) ?? '';
        await next.scrollIntoViewIfNeeded();
        await next.click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    }
    const height = page.viewportSize()?.height ?? 0;
    for (let step = 0; step < 2; step += 1) {
        await page.goBack();
        await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
        await expect(rail.getByRole('link').first()).toBeVisible();
        const top = await settledTop();
        expect(top).toBeGreaterThanOrEqual(0);
        expect(top).toBeLessThan(height);
    }
    await expect(page).toHaveTitle(/^.+, ShelfLens$/);
});

test('a visit that begins on a product offers the store as the way out', async ({ page }) => {
    await page.goto('/?product=SL-00001');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.getByRole('button', { name: 'Browse all products' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        /^All products, \d+ products$/
    );
});

test('a second product shows the first beside it, and the first shows its category', async ({
    page,
}) => {
    await page.goto('/?product=SL-00001');
    const first = page.getByRole('heading', { level: 1 });
    await expect(first).toBeFocused();
    const firstName = await first.textContent();
    const rail = page.getByRole('region', { name: /Most rated in|Viewed with/ });
    await expect(rail.getByRole('heading', { level: 2 })).toHaveText(/^Most rated in /);
    await expect(rail.locator('.card-link[data-sku="SL-00001"]')).toHaveCount(0);
    await audit(page);

    await page.goto('/?product=SL-00002');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    // One product was viewed with it, and the category fills the rest, so the heading says both.
    await expect(rail.getByRole('heading', { level: 2 })).toHaveText(
        /^Viewed with this product, then most rated in /
    );
    await expect(rail.getByRole('link').first()).toContainText(firstName ?? '');
    await audit(page);
});

test('the product page holds its shape: a name without a ring, the stock with the price, a short table', async ({
    page,
    request,
}) => {
    const catalog = (await (await request.get('/catalog.json')).json()) as ShippedCatalog;
    const everyone = catalog.products.filter((p) => p.visibleTo.length === 2);
    const soldOut = everyone.find((p) => p.variants.every((v) => !v.inStock));
    const long = [...everyone].sort((a, b) => b.variants.length - a.variants.length)[0];
    if (!soldOut || !long) throw new Error('expected a sold out product and a long one');

    await page.goto(`/?product=${soldOut.sku}`);
    const name = page.getByRole('heading', { level: 1 });
    await expect(name).toBeFocused();
    // Focus put there by the page draws no ring, since the heading is not a control.
    expect(await name.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
    // "Out of stock" sits under the price as the member lines do.
    const price = await page.locator('.product-price').boundingBox();
    const stock = await page.locator('.product-stock').boundingBox();
    if (!price || !stock) throw new Error('expected the price and the stock line');
    expect(stock.y - (price.y + price.height)).toBeLessThanOrEqual(6);

    // A long list of variants is a few rows, so the rail is within a scroll of the top.
    await page.goto(`/?product=${long.sku}`);
    const rows = await page.getByRole('table').locator('tbody tr').count();
    expect(rows).toBeLessThanOrEqual(long.variants.length / 2);
    const rail = await page.locator('.rail').boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    if (!rail) throw new Error('expected the rail');
    expect(rail.y).toBeLessThan(height * 1.5);
    await audit(page);

    // While a product loads, its line stays muted, a moment on the way and not the answer.
    // The store answers inside the page, so the request is held there until released.
    await page.addInitScript(() => {
        const answer = window.fetch.bind(window);
        const gate = new Promise<void>((resolve) => {
            Object.assign(window, { releaseProduct: resolve });
        });
        window.fetch = async (input, init) => {
            const url =
                typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (decodeURIComponent(url).includes('"sku":"NOPE-1"')) await gate;
            return answer(input, init);
        };
    });
    await page.goto('/?product=NOPE-1');
    const loading = page.getByText('Loading the product.');
    await expect(loading).toBeVisible();
    const color = (locator: ReturnType<typeof page.locator>) =>
        locator.evaluate((el) => getComputedStyle(el).color);
    const text = await color(page.locator('body'));
    expect(await color(loading)).not.toBe(text);
    await page.evaluate(() => {
        (window as unknown as { releaseProduct: () => void }).releaseProduct();
    });

    // With no product to show, the page has a heading and says so in the text's own color.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No such product');
    expect(await color(page.locator('.product > .notice.is-answer'))).toBe(text);
    const view = page.getByRole('region', { name: /^There is no product NOPE-1/ });
    await expect(view).toBeFocused();
    expect(await view.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
    await expect(page).toHaveTitle(/^No such product, /);
    await audit(page);
});
