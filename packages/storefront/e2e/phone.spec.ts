import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/*
 * The same storefront on a phone: the facets are a drawer, and the popover
 * takes the width of the screen.
 */

test.skip(({ isMobile }) => !isMobile, 'phone layout only');

// The tour opens itself on a first visit. These are not that visit.
test.beforeEach(({ page }) =>
    page.addInitScript(() => localStorage.setItem('shelflens.tour', 'seen'))
);

test('the facets open in a drawer, narrow the results, and close back to them', async ({
    page,
}) => {
    await page.goto('/?category=shoes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Shoes, \d+ products$/);
    await expect(page.getByRole('group', { name: 'Brand' })).toBeHidden();

    const open = page.getByRole('button', { name: 'Filters' });
    // The heading comes first, then the button, on its own line under it.
    const headingBox = await page.getByRole('heading', { level: 1 }).boundingBox();
    const openBox = await open.boundingBox();
    if (!headingBox || !openBox) throw new Error('expected the heading and the button on screen');
    expect(openBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    await open.click();
    const drawer = page.getByRole('dialog', { name: 'Filters' });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
    // Outside the results, so their dimming while the next answer loads never reaches it.
    expect(await drawer.evaluate((panel) => panel.closest('.results-main'))).toBeNull();

    const brand = drawer.getByRole('group', { name: 'Brand' }).getByRole('checkbox').first();
    await brand.check();
    await expect(page).toHaveURL(/brand=/);
    await expect(drawer.getByRole('button', { name: /Show \d+ results/ })).toBeVisible();
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations).toEqual([]);

    await drawer.getByRole('button', { name: /Show \d+ results/ }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: /Filters/ })).toBeFocused();
    await expect(page.getByRole('button', { name: /Filters/ })).toContainText('1');
});

test('the popover fits the screen and works from the keyboard', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.tap();
    await search.fill('boot');
    const listbox = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(listbox).toBeVisible();
    const box = await listbox.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\?q=/);
});

test('the explainer fits a phone, with its steps stacked and nothing scrolling sideways', async ({
    page,
}) => {
    await page.goto('/about/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How ShelfLens works');
    const steps = page.locator('.flow li');
    await expect(steps).toHaveCount(5);
    const first = await steps.nth(0).boundingBox();
    const second = await steps.nth(1).boundingBox();
    expect(second?.y ?? 0).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0));
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
});

test('the recent searches fit the screen and audit clean', async ({ page }) => {
    await page.goto('/?q=jacket');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.tap();
    const recent = page.getByRole('listbox', { name: 'Recent searches' });
    await expect(recent).toBeVisible();
    const box = await page.locator('.searchbox-popover').boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
});

test('a rule half typed in the drawer survives the device turning', async ({ page }) => {
    await page.goto('/?q=jacket&explain=1&rules=1');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: 'Edit rules' }).tap();
    const drawer = page.getByRole('dialog', { name: 'Rules' });
    await drawer.getByRole('button', { name: 'Add a rule' }).tap();
    await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill('Last first');
    // Turned sideways, the page is wider than a phone, and the panel is a column.
    await page.setViewportSize({ width: 1024, height: 600 });
    const panel = page.getByRole('complementary', { name: 'Rules' });
    await expect(panel.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
        'Last first'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Edit rules' }).tap();
    await expect(drawer.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
        'Last first'
    );
});

test('Escape closes the drawer after a choice takes away the button that had focus', async ({
    page,
}) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Filters' }).click();
    const drawer = page.getByRole('dialog', { name: 'Filters' });
    // A category's button gives way to its children once chosen.
    await drawer.getByRole('group', { name: 'Category' }).getByRole('button').first().click();
    await expect(page).toHaveURL(/category=/);
    await expect(drawer.getByRole('heading', { name: 'Filters' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: /Filters/ })).toBeFocused();
});

test('on a phone the product name has the width of the page, under its swatch', async ({
    page,
}) => {
    await page.goto('/?product=SL-00145');
    const name = page.getByRole('heading', { level: 1 });
    await expect(name).toBeFocused();
    const swatch = await page.locator('.product-head .swatch').boundingBox();
    const box = await name.boundingBox();
    if (!swatch || !box) throw new Error('expected the swatch and the name');
    expect(box.y).toBeGreaterThanOrEqual(swatch.y + swatch.height);
    expect(await name.evaluate((el) => getComputedStyle(el).fontSize)).toBe('24px');
    // The name wraps once at most.
    const line = Number.parseFloat(await name.evaluate((el) => getComputedStyle(el).lineHeight));
    expect(box.height).toBeLessThanOrEqual(line * 2 + 1);
});
