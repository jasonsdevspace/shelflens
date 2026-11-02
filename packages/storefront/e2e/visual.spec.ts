import type { Locator } from '@playwright/test';

import { expect, type Page, test } from './support.js';

/*
 * The parts of the store whose look a reader would notice going wrong,
 * each compared with a screenshot taken in Playwright's Linux image, in
 * the light and the dark theme. A part, not the page, so a change to the
 * catalog or the copy elsewhere does not move every picture.
 *
 * Each test is tagged with the screens it is taken on: the cards, the
 * suggestions and the widget on the desktop, the filters drawer on the
 * phone, and the toolbar and the product on both.
 *
 * These run only in CI's screenshot job, which sets VISUAL. A run with no
 * picture to compare with fails and keeps what it took, to look at and
 * commit. Taking them again is `npm run screenshots:accept` with the run.
 */

/**
 * The page as it settles: what the test waits for is there, which a page
 * still loading has not drawn, then nothing is busy and the fonts are in.
 */
const settle = async (page: Page, ready: Locator) => {
    await expect(ready).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
};

const resultsFor = (page: Page, phrase: string) =>
    page.getByRole('heading', { level: 1, name: new RegExp(`results? for "${phrase}"`) });

for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`in the ${colorScheme} theme`, () => {
        test.beforeEach(async ({ page }) => {
            await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        });

        test('the results toolbar', { tag: ['@desktop', '@phone'] }, async ({ page }) => {
            await page.goto('/?q=jacket');
            await settle(page, resultsFor(page, 'jacket'));
            await expect(page.locator('.results-toolbar')).toHaveScreenshot(
                `toolbar-${colorScheme}.png`
            );
        });

        test(
            'a product, from its name to its sizes and colors',
            { tag: ['@desktop', '@phone'] },
            async ({ page }) => {
                await page.goto('/?product=SL-00241');
                await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
                await settle(page, page.getByRole('table', { name: 'Sizes and colors' }));
                // Soft, so a run that finds the first changed still takes the second.
                await expect
                    .soft(page.locator('.product-head'))
                    .toHaveScreenshot(`product-head-${colorScheme}.png`);
                await expect
                    .soft(page.locator('table.variants'))
                    .toHaveScreenshot(`variants-${colorScheme}.png`);
            }
        );

        test(
            'the first card in explain mode, and a card with focus',
            { tag: '@desktop' },
            async ({ page }) => {
                await page.goto('/?q=jacket&explain=1');
                await settle(page, page.getByRole('list', { name: 'Why this is result 1' }));
                const first = page
                    .getByRole('list', { name: 'Products' })
                    .getByRole('listitem')
                    .first();
                // Soft, so a run that finds the first changed still takes the second.
                await expect.soft(first).toHaveScreenshot(`card-explained-${colorScheme}.png`);
                await page.goto('/?q=jacket');
                await settle(page, resultsFor(page, 'jacket'));
                const card = page.getByRole('list', { name: 'Products' }).getByRole('link').first();
                await card.focus();
                await expect
                    .soft(card.locator('xpath=..'))
                    .toHaveScreenshot(`card-focused-${colorScheme}.png`);
            }
        );

        test('the suggestions', { tag: '@desktop' }, async ({ page }) => {
            await page.goto('/');
            await page.getByRole('combobox', { name: 'Search the store' }).fill('jack');
            const popover = page.locator('.searchbox-popover');
            await settle(page, popover.getByRole('option').first());
            await expect(popover).toHaveScreenshot(`suggestions-${colorScheme}.png`);
        });

        test('the widget on a host page', { tag: '@desktop' }, async ({ page }) => {
            await page.goto('widget/');
            await page.getByRole('combobox', { name: 'Search the store' }).fill('jack');
            await settle(page, page.getByRole('option').first());
            // The page around the box, since its list opens past the box's own edges.
            await expect(page.locator('main')).toHaveScreenshot(`widget-${colorScheme}.png`);
        });

        test('the filters drawer', { tag: '@phone' }, async ({ page }) => {
            await page.goto('/?category=shoes');
            await settle(page, page.getByRole('heading', { level: 1, name: /^Shoes, / }));
            await page.getByRole('button', { name: 'Filters' }).click();
            // The tap leaves the pointer over a row, so it is moved off before the picture.
            await page.mouse.move(0, 0);
            await settle(page, page.getByRole('dialog', { name: 'Filters' }));
            await expect(page.locator('.drawer-panel')).toHaveScreenshot(
                `drawer-${colorScheme}.png`
            );
        });
    });
}
