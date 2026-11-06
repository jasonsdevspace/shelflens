import type { Locator } from '@playwright/test';

import { expect, type Page, settle, test } from './support.js';

/*
 * The strip above every page, drawn as every demo on jasonsdevspace.com draws it: its three links
 * together on the left, in one row over its rule.
 */

/** Where the strip's links sit, and how tall the bar holding them is, as the screen draws it. */
const stripLayout = async (page: Page) => {
    const strip = page.getByRole('navigation', { name: 'Portfolio' });
    const box = async (locator: Locator, what: string) => {
        const drawn = await locator.boundingBox();
        if (!drawn) throw new Error(`expected ${what} to be drawn`);
        return drawn;
    };
    const links = await Promise.all(
        (await strip.getByRole('link').all()).map((link, i) => box(link, `link ${String(i + 1)}`))
    );
    const first = links[0];
    if (!first) throw new Error('expected the strip to have links');
    return {
        height: Math.round((await box(page.locator('.dk-strip'), 'the strip')).height),
        inset: Math.round(first.x),
        starts: links.map((link) => Math.round(link.x)),
        tops: links.map((link) => Math.round(link.y)),
        // Between links on one row, so a link that wrapped is told by its top, not its gap.
        gaps: links.slice(1).flatMap((link, i) => {
            const before = links[i];
            if (before?.y !== link.y) return [];
            return [Math.round(link.x - (before.x + before.width))];
        }),
    };
};

/** The page at the size given, with the strip drawn and settled. */
const openAt = async (page: Page, path: string, width: number) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(path);
    await page.getByRole('navigation', { name: 'Portfolio' }).waitFor();
    await settle(page);
};

for (const [name, path] of [
    ['the store', '/'],
    ['the about page', '/about/'],
] as const) {
    test(`draws the strip on ${name} as every demo does, its links side by side in one row`, async ({
        page,
    }) => {
        await openAt(page, path, 1280);
        // One row 40px tall over its rule, the links side by side on it, 24px apart.
        expect(await stripLayout(page)).toMatchObject({
            height: 41,
            tops: [0, 0, 0],
            gaps: [24, 24],
        });
    });

    test(`draws the strip on ${name} on a phone in rows of links 16px apart`, async ({ page }) => {
        // Where the links wrap depends on the font, so what is held is what any font gives: links
        // on one row 16px apart, each row a link's height below the last, and a link that wraps
        // starting at the row's inset.
        for (const width of [412, 360]) {
            await openAt(page, path, width);
            const { inset, starts, tops, gaps } = await stripLayout(page);
            expect(gaps.every((gap) => gap === 16)).toBe(true);
            expect(tops.every((top) => top % 40 === 0)).toBe(true);
            tops.forEach((top, i) => {
                if (i > 0 && top !== tops[i - 1]) expect(starts[i]).toBe(inset);
            });
        }
    });
}

test('puts the switches on a row below the links on a phone', async ({ page }) => {
    await openAt(page, '/', 412);
    const links = await page.getByRole('navigation', { name: 'Portfolio' }).boundingBox();
    const tools = await page.locator('.dk-strip-tools').boundingBox();
    expect(tools?.y ?? 0).toBeGreaterThanOrEqual((links?.y ?? 0) + (links?.height ?? 0));
});
