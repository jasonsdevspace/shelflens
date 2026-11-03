import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * The design's values are named once, in tokens.css, and every sheet the
 * store's pages and the widget use refers to them by name. The widget's
 * host pages have a sheet of their own, written to look like someone else's
 * site, which is why it is not one of these.
 */

const SHEETS = ['styles.css', 'try/try.css', 'widget/widget.css', 'search/searchbox.css'];

/** The search box, whose sizes follow its own text, since it lives on other people's pages too. */
const RELATIVE = 'search/searchbox.css';

/** A sheet's text with its comments left out. */
const sheet = (name: string) =>
    readFileSync(join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Each declaration of a property in the sheets, with where it is. */
const declarations = (property: string) =>
    SHEETS.flatMap((at) =>
        [...sheet(at).matchAll(new RegExp(`(?<![-\\w])${property}:\\s*([^;{}]+);`, 'g'))].map(
            (match) => ({ at, value: (match[1] ?? '').trim().replace(/\s+/g, ' ') })
        )
    );

/** Every declaration of a property its pattern does not allow, or, in the search box, its relative one. */
const loose = (property: string, allowed: RegExp, relative?: RegExp) =>
    declarations(property)
        .filter(
            ({ at, value }) =>
                !(allowed.test(value) || (at === RELATIVE && relative?.test(value) === true))
        )
        .map(({ at, value }) => `${at}: ${property}: ${value}`);

/** The color names a sheet might reach for instead of a token. */
const NAMED =
    /(?<![-\w])(black|white|red|green|blue|gray|grey|silver|yellow|orange|purple|pink|brown|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|gold|beige|ivory|tan|crimson|indigo|violet|coral|salmon|khaki|plum|orchid)(?![-\w])/i;

/** Every way of writing a color by value. */
const BY_VALUE =
    /#[0-9a-f]{3,8}\b|(?<![-\w])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/gi;

/** The properties that take a color. */
const COLORED = [
    'color',
    'background',
    'background-color',
    'background-image',
    'border',
    'border-color',
    'border-top',
    'border-bottom',
    'border-left',
    'border-right',
    'outline',
    'outline-color',
    'fill',
    'stroke',
    'box-shadow',
    'accent-color',
    'text-decoration-color',
    'caret-color',
];

/** The color roles a block sets from the palette's pairs, with the pairs each one names. */
const roles = (block: string) =>
    [...block.matchAll(/--([a-z-]+): ([^;]+);/g)]
        .map((match) => ({
            role: match[1] ?? '',
            pairs: [...(match[2] ?? '').matchAll(/--(?:light|dark)-([a-z-]+)/g)].map(
                (pair) => pair[1]
            ),
        }))
        .filter(({ pairs }) => pairs.length > 0);

describe('the design tokens', () => {
    it('write the palette once, so no sheet writes a color of its own', () => {
        const byValue = SHEETS.flatMap((at) =>
            [
                // The feature check for light-dark() names two colors to ask whether it is known.
                ...sheet(at).replace('light-dark(#000, #fff)', '').matchAll(BY_VALUE),
            ].map((match) => `${at}: ${match[0]}`)
        );
        const named = COLORED.flatMap((property) =>
            declarations(property)
                .filter(({ value }) => NAMED.test(value))
                .map(({ at, value }) => `${at}: ${property}: ${value}`)
        );
        expect([...byValue, ...named]).toEqual([]);
    });

    it('choose every color by name, each role from its own pair, in every list that chooses', () => {
        const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
        const pairs = [...tokens.matchAll(/--light-([a-z-]+):/g)].map((match) => match[1] ?? '');
        for (const name of pairs) expect(tokens, name).toContain(`--dark-${name}:`);
        const page = sheet('styles.css');
        const widget = sheet('widget/widget.css');
        const lists = {
            'the light page': /:root \{([^}]*)\}/.exec(page)?.[1],
            'the dark page': /:root\[data-theme='dark'\] \{([^}]*)\}/.exec(page)?.[1],
            'the widget': /\.shelflens \{([^}]*)\}/.exec(widget)?.[1],
            'the widget by its scheme': /@supports[^{]*\{\s*\.shelflens \{([^}]*)\}/.exec(
                widget
            )?.[1],
        };
        for (const [list, block] of Object.entries(lists)) {
            const set = roles(block ?? '');
            expect(set.map(({ role }) => role).sort(), list).toEqual([...pairs].sort());
            for (const { role, pairs: named } of set) {
                expect(new Set(named), `${list}: --${role}`).toEqual(new Set([role]));
            }
        }
    });

    it('name every type size, weight and line height', () => {
        expect([
            ...loose(
                'font-size',
                /^(var\(--text-[a-z]+\)|max\(var\(--text-body\), 16px\)|inherit)$/,
                /^[\d.]+em$/
            ),
            ...loose('font-weight', /^var\(--weight-[a-z]+\)$/),
            ...loose('line-height', /^var\(--(leading-[a-z]+|space-\d)\)$/),
            // The widget's frame pins its text, at a size no host's root can scale.
            ...loose('font', /^(inherit|16px\/var\(--leading-[a-z]+\) system-ui, .*)$/),
        ]).toEqual([]);
    });

    it('name every corner and every shadow', () => {
        expect([
            ...loose('border-radius', /^((var\(--radius(-[a-z]+)?\)|0)( |$))+$/, /^[\d.]+em$/),
            ...loose('box-shadow', /^(var\(--shadow-raised\)|none)$/),
        ]).toEqual([]);
    });
});

/** Every declaration in the sheets, as its property and its value, with where it is. */
const everyDeclaration = () =>
    SHEETS.flatMap((at) =>
        [...sheet(at).matchAll(/(?<![-\w])([a-z-]+):\s*([^;{}]+);/g)].map((match) => ({
            at,
            property: match[1] ?? '',
            value: (match[2] ?? '').trim().replace(/\s+/g, ' '),
        }))
    );

/**
 * Where a pixel belongs, as the tokens say: a border or a ring, which must
 * not scale, the floor below which a phone zooms a field, the widget's
 * pinned text, and the one pixel a visually hidden element keeps.
 */
const PIXEL_ALLOWED = [
    ({ property }: { property: string }) => /^(border|outline)(-[a-z]+)*$/.test(property),
    ({ value }: { value: string }) => value === 'max(var(--text-body), 16px)',
    ({ at, property, value }: { at: string; property: string; value: string }) =>
        at === 'widget/widget.css' && property === 'font' && value.startsWith('16px/'),
    ({ property, value }: { property: string; value: string }) =>
        ['width', 'height', 'margin'].includes(property) && /^-?1px$/.test(value),
    // The column's inset, which is never less than nothing.
    ({ value }: { value: string }) => value.startsWith('calc(max(0px,'),
];

/** The breakpoints the tokens name, as a media query writes them. */
const BREAKPOINTS = ['(max-width: 48rem)'];

describe('the units', () => {
    it('keep pixels to what must not scale', () => {
        const stray = everyDeclaration()
            .filter(({ value }) => /\dpx/.test(value))
            .filter((declaration) => !PIXEL_ALLOWED.some((allowed) => allowed(declaration)))
            .map(({ at, property, value }) => `${at}: ${property}: ${value}`);
        expect(stray).toEqual([]);
    });

    it('break only where the tokens name a breakpoint', () => {
        const queries = [...SHEETS, 'widget/host.css'].flatMap((at) =>
            [...sheet(at).matchAll(/@media ([^{]+)\{/g)]
                .map((match) => (match[1] ?? '').trim())
                .filter((query) => /width|height/.test(query))
                .map((query) => ({ at, query }))
        );
        expect(queries.length).toBeGreaterThan(0);
        expect(
            queries
                .filter(({ query }) => !BREAKPOINTS.includes(query))
                .map(({ at, query }) => `${at}: ${query}`)
        ).toEqual([]);
        const named = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
        for (const breakpoint of BREAKPOINTS) {
            expect(named, breakpoint).toContain(
                breakpoint.replace(/^\(max-width: (.*)\)$/, 'up to $1')
            );
        }
    });
});

/** The properties that set space around or between things. */
const SPACING =
    /^(gap|row-gap|column-gap|margin(-[a-z]+)*|padding(-[a-z]+)*|inset(-[a-z]+)*|top|bottom|left|right)$/;

describe('the spacing', () => {
    it('takes every gap, margin and padding from the steps', () => {
        const stray = everyDeclaration()
            .filter(({ property }) => SPACING.test(property))
            // The search box's space follows its own text, as its sizes do.
            .filter(({ at }) => at !== RELATIVE)
            .filter(({ at, property, value }) =>
                /\d*\.?\d+(rem|em)\b/.test(
                    value
                        // The skip link waits out of sight, past any step, until it takes focus.
                        .replace(
                            /^-10rem$/,
                            at === 'styles.css' && property === 'top' ? '' : '-10rem'
                        )
                        .replace(/var\(--[a-z-]+\d?\)/g, '')
                )
            )
            .map(({ at, property, value }) => `${at}: ${property}: ${value}`);
        expect(stray).toEqual([]);
    });
});
