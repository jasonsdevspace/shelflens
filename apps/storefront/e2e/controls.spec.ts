import type { Page } from '@playwright/test';

import { PAGES } from '../src/bench/pages.js';
import { expect, rulesPanel, test } from './support.js';

/*
 * Every control on every page, in both themes, on the desktop and the
 * phone. A control's edge stands out from what is behind it by 3 to 1, as
 * WCAG asks of anything a visitor has to find to use, and every control
 * draws the one accent focus ring. axe checks text, not edges or rings.
 *
 * Each select is drawn alike: its caret as far in from the right as its
 * text from the left, room kept so a long value never runs under it, and
 * on a phone a thumb's height with text a tap does not zoom.
 */

/** Everything this reads runs in the page, so it is written to be sent there as it is. */
const inspect = () => {
    type Rgba = readonly [number, number, number, number];
    const rgba = (color: string): Rgba => {
        const parts =
            /rgba?\(([^)]+)\)/
                .exec(color)?.[1]
                ?.split(/[\s,/]+/)
                .filter(Boolean) ?? [];
        const [r = 0, g = 0, b = 0, a = 1] = parts.map(Number);
        return [r, g, b, a];
    };
    const luminance = ([r, g, b]: Rgba) => {
        const linear = (v: number) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const contrast = (a: Rgba, b: Rgba) => {
        const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
        return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
    };
    /** The element around this one, through a shadow root to its host. */
    const parentOf = (element: Element): Element | undefined => {
        if (element.parentElement) return element.parentElement;
        const root = element.getRootNode();
        return root instanceof ShadowRoot ? root.host : undefined;
    };
    /** The color behind an element: the first opaque background around it. */
    const behind = (element: Element): Rgba => {
        for (let at = parentOf(element); at; at = parentOf(at)) {
            const color = rgba(getComputedStyle(at).backgroundColor);
            if (color[3] > 0.5) return color;
        }
        return rgba(getComputedStyle(document.body).backgroundColor);
    };
    const all = (root: Document | ShadowRoot): Element[] =>
        [...root.querySelectorAll('*')].flatMap((element) =>
            element.shadowRoot ? [element, ...all(element.shadowRoot)] : [element]
        );
    const name = (element: Element) => {
        const text = element.textContent.trim().slice(0, 30);
        return `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} "${text === '' ? (element.getAttribute('aria-label') ?? '') : text}"`;
    };
    const shown = (element: Element) => {
        const box = element.getBoundingClientRect();
        return box.width > 2 && box.height > 2 && getComputedStyle(element).visibility !== 'hidden';
    };

    /** An edge that is a control's only outline stands out by 3 to 1. A filled control stands out by its fill. */
    const edgeOf = (control: Element): string[] => {
        const style = getComputedStyle(control);
        const around = behind(control);
        const fill = rgba(style.backgroundColor);
        const edge = rgba(style.borderTopColor);
        const bordered =
            parseFloat(style.borderTopWidth) >= 1 &&
            style.borderTopStyle !== 'none' &&
            edge[3] > 0.5;
        const filled = fill[3] > 0.5 && contrast(fill, around) >= 3;
        if (!bordered || filled) return [];
        const ratio = contrast(edge, around);
        return ratio < 3 ? [`${name(control)} has an edge of ${ratio.toFixed(2)} to 1`] : [];
    };

    /** A select's caret, the room kept for it, and on a phone its height and its text. */
    const selectOf = (control: Element): string[] => {
        if (control.tagName !== 'SELECT') return [];
        const style = getComputedStyle(control);
        const left = parseFloat(style.paddingLeft);
        const right = parseFloat(style.paddingRight);
        // The caret is two halves side by side, each placed from the right, which a browser
        // computes as `calc(100% - 14px), calc(100% - 8px)`: the left half, then the right.
        const [far = NaN, inset = NaN] = [
            ...style.backgroundPositionX.matchAll(/(\d+(?:\.\d+)?)px/g),
        ].map((match) => Number(match[1]));
        const half = parseFloat(style.backgroundSize);
        const { height } = control.getBoundingClientRect();
        const phone = innerWidth <= 768;
        return [
            style.appearance === 'none' ? '' : 'draws the browser’s caret',
            Math.abs(inset - left) <= 0.5
                ? ''
                : `has its caret ${String(inset)}px from the right, its text ${String(left)}px from the left`,
            Math.abs(far - inset - half) <= 0.5
                ? ''
                : 'draws its caret in two halves that do not meet',
            right >= left * 2 + 12 ? '' : 'lets its value run under its caret',
            phone && height < 44 ? `is ${String(height)}px high on a phone` : '',
            phone && parseFloat(style.fontSize) < 16
                ? `has ${style.fontSize} text, which a tap zooms`
                : '',
        ]
            .filter((problem) => problem !== '')
            .map((problem) => `${name(control)} ${problem}`);
    };

    return all(document)
        .filter(
            (element) =>
                element.matches(
                    'button, select, input:not([type="checkbox"], [type="radio"], [type="file"], [type="hidden"])'
                ) &&
                !('disabled' in element && element.disabled === true) &&
                shown(element)
        )
        .flatMap((control) => [...edgeOf(control), ...selectOf(control)]);
};

/** The most Tab presses a page may take before focus comes back around. */
const MOST_STOPS = 400;

/**
 * Each control focus reaches by Tab, and how its ring is drawn, until focus
 * comes back to one it has already reached. Each is marked in the page as
 * it is reached, so scrolling never makes one look new.
 */
const rings = async (page: Page): Promise<string[]> => {
    const problems: string[] = [];
    for (let step = 0; step < MOST_STOPS; step += 1) {
        await page.keyboard.press('Tab');
        const found = await page.evaluate(() => {
            let active = document.activeElement;
            while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
            if (!active || active === document.body) return undefined;
            // The controls reached so far are kept on the page's window, since each press reads
            // focus in a fresh evaluate.
            const walked: Window & { reached?: WeakSet<Element> } = window;
            const reached = (walked.reached ??= new WeakSet());
            if (reached.has(active)) return 'around';
            reached.add(active);
            if (
                !active.matches("a[href], button, input, select, textarea, summary, [tabindex='0']")
            ) {
                return undefined;
            }
            const style = getComputedStyle(active);
            const probe = document.createElement('i');
            probe.style.color = style.getPropertyValue('--dk-accent').trim();
            document.body.append(probe);
            const accent = getComputedStyle(probe).color;
            probe.remove();
            const width = style.getPropertyValue('--dk-ring-width').trim();
            return {
                id: `${active.tagName.toLowerCase()} "${active.textContent.trim().slice(0, 30)}"`,
                ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
                expected: `solid ${width} ${accent}`,
                // A file input draws its ring on the box around it.
                around:
                    active.matches('input[type="file"]') && active.parentElement
                        ? getComputedStyle(active.parentElement).outlineStyle
                        : undefined,
            };
        });
        if (found === 'around') return problems;
        if (!found || found.around === 'solid') continue;
        if (found.ring !== found.expected) {
            problems.push(`${found.id} draws ${found.ring}, not ${found.expected}`);
        }
    }
    return [...problems, `focus did not come back around within ${String(MOST_STOPS)} stops`];
};

for (const colorScheme of ['light', 'dark'] as const) {
    test(`every control stands out and draws the one focus ring, in the ${colorScheme} theme`, async ({
        page,
        baseURL,
    }) => {
        test.setTimeout(120_000);
        await page.emulateMedia({ colorScheme });
        const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
        const problems: string[] = [];
        for (const { path, prepare, ready } of PAGES) {
            if (prepare) await prepare(page, origin);
            await page.goto(`${origin}${path}`);
            if (ready) await ready(page);
            problems.push(...(await page.evaluate(inspect)).map((found) => `${path}: ${found}`));
            problems.push(...(await rings(page)).map((found) => `${path}: ${found}`));
        }
        expect(problems, `controls in the ${colorScheme} theme`).toEqual([]);
    });
}

test('keeps the try page to the screen when a column name is long', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a long name widens the page only where the screen is narrow');
    await page.goto('/try/');
    const long = 'The full name of the color this product comes in, as the supplier wrote it';
    await page.getByLabel('Choose a file').setInputFiles({
        name: 'long.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`name,price,"${long}"\nBench,120,Oak\n`),
    });
    await page.getByRole('heading', { name: 'Where each part of a product comes from' }).waitFor();
    await page.getByLabel('Colors', { exact: true }).selectOption(long);
    // Neither the page nor any select may reach past the screen, whether or not something clips it.
    const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        selects: Math.max(
            ...[...document.querySelectorAll('select')].map((select) =>
                Math.ceil(select.getBoundingClientRect().right)
            )
        ),
    }));
    // The device's width, not the page's: a phone widens its viewport to fit a page that is too wide.
    const screen = page.viewportSize()?.width ?? 0;
    expect(widths.page).toBeLessThanOrEqual(screen);
    expect(widths.selects).toBeLessThanOrEqual(screen);
});

test('lines the rule form’s text fields up with its selects, and holds its controls to the rest', async ({
    page,
    isMobile,
}) => {
    // The rules open beside the results on a wide screen, and a phone opens them in a drawer.
    await page.goto('/?q=jacket&explain=1&rules=1');
    await expect(page.locator('.results-layout')).toHaveAttribute('aria-busy', 'false');
    const panel = await rulesPanel(page, isMobile);
    await panel.getByRole('button', { name: 'Add a rule' }).click();
    await panel.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
    // A boost asks what it is on and how much, so the form holds selects beside its text fields.
    await panel.getByRole('radio', { name: /^Boost/ }).check();
    await panel.getByRole('combobox', { name: 'How much' }).waitFor();
    const fields = await panel.locator('.rules-form').evaluate((form) =>
        [...form.querySelectorAll('input:not([type="checkbox"], [type="radio"]), select')].map(
            (field) => {
                const style = getComputedStyle(field);
                return `${field.tagName} ${style.paddingLeft} ${style.borderLeftWidth} ${field.getBoundingClientRect().height}px`;
            }
        )
    );
    expect(fields.some((field) => field.startsWith('SELECT'))).toBe(true);
    expect(fields.some((field) => field.startsWith('INPUT'))).toBe(true);
    expect(
        new Set(fields.map((field) => field.split(' ').slice(1).join(' '))).size,
        fields.join(', ')
    ).toBe(1);
    expect(await page.evaluate(inspect)).toEqual([]);
});

test('draws the search box the same height in the store and on a page that is not the store’s', async ({
    page,
}) => {
    const heightOf = async (path: string) => {
        await page.goto(path);
        const box = page.getByRole('combobox', { name: 'Search the store' });
        await box.waitFor();
        return (await box.boundingBox())?.height;
    };
    const store = await heightOf('/');
    expect(store).toBeGreaterThan(0);
    // At the browser's usual text size, which the store follows and the widget pins.
    expect(await heightOf('/widget/')).toBeCloseTo(store ?? 0, 1);
});
