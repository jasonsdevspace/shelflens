import { expect, type Page, test } from '@playwright/test';

/*
 * Every page carries a Content Security Policy that allows only its own
 * origin and its one inline script. Anything the page does that the policy
 * refuses shows up as a violation, so the store, the explainer, the widget
 * and the page for a visitor's catalog are each used here with every
 * violation collected, and none is allowed.
 */

test.skip(({ isMobile }) => isMobile, 'one browser is enough for the policy');

const watch = async (page: Page): Promise<string[]> => {
    const refused: string[] = [];
    page.on('console', (message) => {
        if (/Content Security Policy/i.test(message.text())) refused.push(message.text());
    });
    await page.addInitScript(() => {
        localStorage.setItem('shelflens.tour', 'seen');
        document.addEventListener('securitypolicyviolation', (event) => {
            console.error(
                `Content Security Policy refused ${event.violatedDirective}: ${event.blockedURI}`
            );
        });
    });
    return refused;
};

test('the store, the explainer, the widget and the try page run within their policy', async ({
    page,
}) => {
    const refused = await watch(page);

    await page.goto('./');
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
        'content',
        /script-src 'self' 'sha256-/
    );
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.fill('jack');
    await expect(page.getByRole('listbox')).toBeVisible();
    await search.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jack"');
    await page.goto('./?q=jacket&explain=1&rules=1');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for "jacket"');
    await page.goto('./?product=SL-00001');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    await page.goto('about/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('widget/');
    const box = page.getByRole('combobox', { name: 'Search the store' });
    await box.fill('jack');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.goto('try/');
    await page.getByRole('button', { name: 'Try it with a sample of 200 products' }).click();
    await expect(
        page.getByRole('heading', { level: 1, name: 'What is in sample-products.csv' })
    ).toBeVisible();
    await page.goto('try/widget/');
    await expect(page.locator('#shelflens-search')).toBeVisible();

    expect(refused).toEqual([]);
});

test('the widget styles its box within the policy where a browser cannot share a stylesheet', async ({
    page,
}) => {
    const refused = await watch(page);
    // As an older browser: no constructed stylesheets, so the widget writes a style element.
    await page.addInitScript(() => {
        Reflect.deleteProperty(CSSStyleSheet.prototype, 'replaceSync');
    });
    await page.goto('widget/');
    const box = page.getByRole('combobox', { name: 'Search the store' });
    await box.fill('jack');
    await expect(page.getByRole('listbox')).toBeVisible();
    const styled = await page.locator('#shelflens-search').evaluate((host) => {
        const shadow = host.shadowRoot;
        const input = shadow?.querySelector('input');
        return {
            elements: shadow?.querySelectorAll('style').length ?? 0,
            width: input ? getComputedStyle(input).width : '',
        };
    });
    expect(styled.elements).toBeGreaterThan(0);
    // The stylesheet applied: the input takes the width of its box, not the browser's default.
    expect(Number.parseFloat(styled.width)).toBeGreaterThan(200);
    expect(refused).toEqual([]);
});
