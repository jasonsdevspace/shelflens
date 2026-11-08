import { audit, expect, test } from './support.js';

/*
 * The widget on a page that is not the store's: a React of its own, styles
 * that reach every list item, button and input, a banner stacked over
 * everything and a box that clips what it holds. The widget keeps its
 * look, its place and its React. Playwright's locators see into the
 * widget's shadow root, and axe audits it.
 */

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
        // The middle of the part of the list a visitor sees. Where the room beside the box is
        // short, the list scrolls inside a popover held to the viewport, so the list's own middle
        // can lie past what shows.
        const shown = await listbox.evaluate((list) => {
            const frame = list.closest('[popover]') ?? list;
            const a = list.getBoundingClientRect();
            const b = frame.getBoundingClientRect();
            const top = Math.max(a.top, b.top, 0);
            const bottom = Math.min(a.bottom, b.bottom, window.innerHeight);
            return { x: a.left + a.width / 2, y: (top + bottom) / 2, tall: bottom - top };
        });
        // At least a whole suggestion shows, so the list can be used where it opens.
        const option = await listbox.getByRole('option').first().boundingBox();
        expect(shown.tall).toBeGreaterThanOrEqual(option?.height ?? Infinity);
        const atCenter = await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.id ?? '',
            { x: shown.x, y: shown.y }
        );
        expect(atCenter).toBe('shelflens-search');
        // Out past the clipping box's edge, below it or above it, where the box sits low
        // enough that more of the list fits above.
        const clip = await page.locator('.host-clip').boundingBox();
        expect(clip).not.toBeNull();
        if (clip) {
            const past = box.y + box.height > clip.y + clip.height || box.y < clip.y;
            expect(past, JSON.stringify({ box, clip })).toBe(true);
        }
    }
    // The list can be a scrolling region here, where the box sits low on the page, and
    // the rule for those wants a tab stop. The combobox contract keeps focus in the
    // box and keeps the active option in view from the arrow keys, which the rule
    // cannot see and the steps below prove, so that one rule is left out of this audit.
    await audit(page, ['scrollable-region-focusable']);
    for (let step = 0; step < 6; step += 1) await search.press('ArrowDown');
    // The option the arrows reached is in the list's view, scrolled to where the list scrolls.
    const active = listbox.locator('[aria-selected="true"]');
    await expect(active).toHaveCount(1);
    const inView = await active.evaluate((option) => {
        const view = option.closest('[role="listbox"]')?.parentElement ?? option;
        const [shown, list] = [option.getBoundingClientRect(), view.getBoundingClientRect()];
        return shown.top >= list.top - 1 && shown.bottom <= list.bottom + 1;
    });
    expect(inView).toBe(true);

    // Typed again, so nothing is highlighted, and Enter searches what was typed.
    await search.fill('');
    await search.fill('boot');
    await expect(listbox).toBeVisible();
    await search.press('Enter');
    await expect(page).toHaveURL(/\/\?q=boot/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('results for');
});

test('opens the list above a box set low, where more of it fits than below', async ({
    page,
    isMobile,
}) => {
    await page.goto('/widget/');
    await page.mouse.move(0, 0);
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.fill('boot');
    const listbox = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(listbox.getByRole('option').first()).toBeVisible();
    const place = () =>
        listbox.evaluate((list) => {
            const frame = list.closest('[popover]');
            const root = list.getRootNode();
            const field =
                root instanceof ShadowRoot || root instanceof Document
                    ? root.querySelector('[role="combobox"]')
                    : null;
            if (!(frame instanceof HTMLElement) || !field) throw new Error('no popover or box');
            const box = field.getBoundingClientRect();
            const shown = frame.getBoundingClientRect();
            return {
                below: innerHeight - box.bottom,
                above: box.top,
                needs: frame.scrollHeight + frame.offsetHeight - frame.clientHeight,
                top: shown.top,
                bottom: shown.bottom,
                boxTop: box.top,
                tall: shown.height,
            };
        });
    // Settled once the suggestions have arrived and the list has been placed for them.
    await expect.poll(async () => (await place()).bottom <= (await place()).boxTop).toBe(true);
    const at = await place();
    // The case the rule is for: room under the box, but less than the list needs, and more
    // above it, so a list opened below would show only part of itself.
    expect(at.below, JSON.stringify(at)).toBeLessThan(at.needs);
    expect(at.below, JSON.stringify(at)).toBeGreaterThan(160);
    expect(at.above, JSON.stringify(at)).toBeGreaterThan(at.below);
    // Above the box, showing more of the list than the room under it would, which is the
    // whole list on a phone.
    expect(at.bottom, JSON.stringify(at)).toBeLessThanOrEqual(at.boxTop);
    expect(at.tall, JSON.stringify(at)).toBeGreaterThan(at.below);
    if (isMobile) expect(at.tall, JSON.stringify(at)).toBeGreaterThanOrEqual(at.needs - 1);
});

test('says the search box is loading until it arrives', async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/widget.js', async (route) => {
        await held;
        await route.continue();
    });
    await page.goto('/widget/');
    await expect(page.getByText('Loading the search box.')).toBeVisible();
    release();
    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page.getByText('Loading the search box.')).toBeHidden();
});
