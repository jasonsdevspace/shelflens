import { expect, type Page, settle, test } from './support.js';

/*
 * The strip above every page, drawn as every demo on jasonsdevspace.com draws it: its three links
 * together on the left, in one row over its rule.
 */

/** Where the strip's links sit, and how tall the bar holding them is, as the screen draws it. */
const stripLayout = async (page: Page) => {
    const strip = page.getByRole('navigation', { name: 'Portfolio' });
    // The bar the strip sits in.
    const bar = page.locator('.topbar');
    const box = async (locator: ReturnType<Page['locator']>) => {
        const drawn = await locator.boundingBox();
        if (!drawn) throw new Error('expected the strip to be drawn');
        return drawn;
    };
    const links = await Promise.all((await strip.getByRole('link').all()).map(box));
    return {
        height: Math.round((await box(bar)).height),
        tops: links.map((link) => Math.round(link.y)),
        gaps: links
            .slice(1)
            .map((link, i) => Math.round(link.x - ((links[i]?.x ?? 0) + (links[i]?.width ?? 0)))),
    };
};

for (const [name, path] of [
    ['the store', '/'],
    ['the about page', '/about/'],
] as const) {
    test(`draws the strip on ${name} as every demo does, its links side by side in one row`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(path);
        await page.getByRole('navigation', { name: 'Portfolio' }).waitFor();
        await settle(page);
        // One row 40px tall over its rule, the links side by side on it, 24px apart.
        expect(await stripLayout(page)).toEqual({ height: 41, tops: [0, 0, 0], gaps: [24, 24] });
    });
}

test('draws the strip on a phone in one row where it fits, wrapping the last link where not', async ({
    page,
}) => {
    await page.setViewportSize({ width: 412, height: 800 });
    await page.goto('/about/');
    await page.getByRole('navigation', { name: 'Portfolio' }).waitFor();
    expect(await stripLayout(page)).toMatchObject({ tops: [0, 0, 0], gaps: [16, 16] });
    // Narrower still, the last link takes a row of its own below the first two.
    await page.setViewportSize({ width: 360, height: 800 });
    expect((await stripLayout(page)).tops).toEqual([0, 0, 40]);
});
