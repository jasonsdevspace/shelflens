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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shoes');
    await expect(page.getByRole('group', { name: 'Brand' })).toBeHidden();

    const open = page.getByRole('button', { name: 'Filters' });
    await open.click();
    const drawer = page.getByRole('dialog', { name: 'Filters' });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();

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
