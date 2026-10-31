import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/*
 * The widget on a page that is not the store's: a React of its own, styles
 * that reach every list item, button and input, a banner stacked over
 * everything and a box that clips what it holds. The widget keeps its
 * look, its place and its React. Playwright's locators see into the
 * widget's shadow root, and axe audits it.
 */

test.beforeEach(({ page }) =>
    page.addInitScript(() => localStorage.setItem('shelflens.tour', 'seen'))
);

test('keeps its look, its place over the host and its own React, and sends a search to the store', async ({
    page,
}) => {
    await page.goto('/widget/');
    await expect(page).toHaveTitle('ShelfLens on another page');
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await expect(search).toBeVisible();

    // The host's own React keeps counting once the widget is mounted.
    await page.getByRole('button', { name: 'Count' }).click();
    await expect(page.getByText(/own React has counted 1/)).toBeVisible();

    // The host's rules reach its own input and list items, and not the widget's. Its
    // selectors see no input at all, since the box is in the widget's own tree.
    const boxFont = await search.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(boxFont).not.toContain('monospace');
    // The clipping box hands everything in it a crosshair, and the widget sets it aside.
    const frameCursor = await page
        .locator('.shelflens')
        .evaluate((el) => getComputedStyle(el).cursor);
    expect(frameCursor).toBe('auto');
    expect(await page.evaluate(() => document.querySelectorAll('.host input').length)).toBe(0);

    // The pointer rests where the Count button was, which the list may open under,
    // and an option under the pointer is highlighted. Parked out of the way.
    await page.mouse.move(0, 0);
    await search.fill('boot');
    const listbox = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(listbox).toBeVisible();
    const option = listbox.getByRole('option').first();
    const optionStyle = await option.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
            color: style.color,
            listStyle: style.listStyleType,
            font: style.fontFamily,
            cursor: style.cursor,
        };
    });
    expect(optionStyle.color).not.toBe('rgb(183, 71, 42)');
    expect(optionStyle.listStyle).toBe('none');
    expect(optionStyle.font).not.toContain('Georgia');
    expect(optionStyle.cursor).toBe('pointer');

    // The list is in the top layer: over the host's banner and out of the clipping box.
    const box = await listbox.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
        const atCenter = await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.id ?? '',
            { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        );
        expect(atCenter).toBe('shelflens-search');
        const clip = await page.locator('.host-clip').boundingBox();
        expect(clip).not.toBeNull();
        if (clip) expect(box.y + box.height).toBeGreaterThan(clip.y + clip.height);
    }
    // The list is a scrolling region here, since the box sits low on this page, and
    // the rule for those wants a tab stop. The combobox contract keeps focus in the
    // box and scrolls the list from the arrow keys, which the rule cannot see and the
    // steps below prove, so that one rule is left out of this audit.
    const audit = await new AxeBuilder({ page })
        .disableRules(['scrollable-region-focusable'])
        .analyze();
    expect(audit.violations).toEqual([]);
    const scrolledBefore = await listbox.evaluate((el) => el.parentElement?.scrollTop ?? 0);
    for (let step = 0; step < 6; step += 1) await search.press('ArrowDown');
    const scrolledAfter = await listbox.evaluate((el) => el.parentElement?.scrollTop ?? 0);
    expect(scrolledAfter).toBeGreaterThan(scrolledBefore);

    // Typed again, so nothing is highlighted, and Enter searches what was typed.
    await search.fill('');
    await search.fill('boot');
    await expect(listbox).toBeVisible();
    await search.press('Enter');
    await expect(page).toHaveURL(/\/\?q=boot/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for');
});
