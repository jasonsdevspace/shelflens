import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * The design's values are named in the design kit's tokens and in the
 * store's tokens.css over them, where the widget's frame repeats the ones it
 * reads, and every sheet the store's pages and the widget use refers to them
 * by name. The widget's host pages have a sheet of
 * their own, written to look like someone else's site, which is why it is
 * not one of these.
 */

/** The sheets that hold the values, and the host pages' own, which are no store sheet. */
const NOT_STORE_SHEETS = new Set(['tokens.css', 'widget/frame-tokens.css', 'widget/host.css']);

/** Every other sheet under src, so a sheet split off is read without being listed. */
const SHEETS = readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
    .map((path) => path.split(sep).join('/'))
    .filter((path) => path.endsWith('.css') && !NOT_STORE_SHEETS.has(path))
    .sort();

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

/** A sheet of values with its comments left out. */
const values = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The store's tokens for its pages, the widget's frame, and the kit's, as the package ships them. */
const STORE_TOKENS = values(join(__dirname, 'tokens.css'));
const FRAME_TOKENS = values(join(__dirname, 'widget', 'frame-tokens.css'));
const KIT_TOKENS = values(
    createRequire(import.meta.url).resolve('@jasonsdevspace/design-kit/tokens.css')
);

/**
 * The declarations in each innermost rule whose selector is the one given, at whatever depth it
 * sits, inside a layer or a feature check included.
 */
const rulesFor = (css: string, selector: string): Map<string, string> =>
    new Map(
        [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
            .filter(([, head]) => (head ?? '').trim().replace(/\s+/g, ' ') === selector)
            .flatMap(([, , body]) =>
                [...(body ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
                    ([, name = '', value = '']) =>
                        [name, value.trim().replace(/\s+/g, ' ')] as const
                )
            )
    );

/** The widget's frame outside the feature check, and its colors by scheme inside it. */
const AT_SUPPORTS = FRAME_TOKENS.indexOf('@supports (color: light-dark(');
const FRAME = rulesFor(FRAME_TOKENS.slice(0, AT_SUPPORTS), '.shelflens');
const BY_SCHEME = rulesFor(FRAME_TOKENS.slice(AT_SUPPORTS), '.shelflens');

/** The roles and names the store sets on its pages. */
const PAGE = rulesFor(STORE_TOKENS, ':root');

/** Every custom property a sheet reads. */
const reads = (css: string) =>
    new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(([, name = '']) => name));

/**
 * A value as a browser without light-dark() takes it: its light-dark(), wherever it sits in the
 * value, replaced by the light half. Nothing where the value has none.
 */
const lightOf = (value: string): string | undefined => {
    const open = 'light-dark(';
    const at = value.indexOf(open);
    if (at < 0) return undefined;
    let depth = 0;
    let comma = -1;
    for (let i = at + open.length; i < value.length; i += 1) {
        const char = value[i];
        if (char === '(') depth += 1;
        else if (char === ')' && depth > 0) depth -= 1;
        else if (char === ',' && depth === 0 && comma < 0) comma = i;
        else if (char === ')') {
            if (comma < 0) return undefined;
            return (
                value.slice(0, at) +
                value.slice(at + open.length, comma).trim() +
                value.slice(i + 1)
            );
        }
    }
    return undefined;
};

/** A color role's light and dark values, from its light-dark(). */
const pair = (value: string): readonly [string, string] | undefined => {
    const found = /^light-dark\((#[\da-f]{6}), (#[\da-f]{6})\)$/i.exec(value);
    return found?.[1] && found[2] ? [found[1], found[2]] : undefined;
};

const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
        const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The contrast WCAG defines between two colors. */
const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

/** The kit's own roles and scale, as its tokens declare them on the root. */
const PALETTE_KIT = rulesFor(KIT_TOKENS, ':where(:root)');

/** The palette the store's pages draw: the kit's roles, with the store's own set over them. */
const PALETTE = new Map([...PALETTE_KIT, ...PAGE]);

const GROUNDS = ['bg', 'surface', 'raised'];
const TONES = ['highlight', 'success-bg', 'danger-bg'];

/**
 * The pairings the kit holds its own palette to, at their ratios, so the store's colors pass what
 * the kit's components drawn on them expect, and the stars of a rating at 3 to 1 on what a card
 * sits on and on its hover.
 */
const PAIRS: readonly (readonly [string, string, number])[] = [
    ...GROUNDS.flatMap((ground): (readonly [string, string, number])[] => [
        ...['fg', 'muted', 'accent', 'success', 'danger'].map(
            (front) => [front, ground, 4.5] as const
        ),
        ['control', ground, 3],
    ]),
    ['on-accent', 'accent', 4.5],
    ...TONES.flatMap((ground) => [
        ['fg', ground, 4.5] as const,
        ['muted', ground, 4.5] as const,
        ['accent', ground, 4.5] as const,
        ['control', ground, 3] as const,
    ]),
    ['success', 'success-bg', 4.5],
    ['danger', 'danger-bg', 4.5],
    ...['bg', 'raised', 'highlight'].map((ground) => ['rating', ground, 3] as const),
];

/** The property each role in the pairings is read from, the kit's own roles under its prefix. */
const OWN_NAMES: Readonly<Record<string, string>> = { rating: '--rating' };
const valueOf = (role: string) => PALETTE.get(OWN_NAMES[role] ?? `--dk-${role}`) ?? '';

describe('the design tokens', () => {
    it('read every store sheet, the ones split off included', () => {
        expect(SHEETS).toEqual(expect.arrayContaining(['styles.css', 'widget/page.css']));
    });

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

    it("sets the widget's colors by its host's scheme, light first for a browser without it", () => {
        expect(BY_SCHEME.size).toBeGreaterThan(0);
        for (const [name, value] of BY_SCHEME) {
            expect(FRAME.get(name), name).toBe(lightOf(value));
        }
        // Every color the frame holds, and every name the store or the kit sets by scheme, is set
        // by scheme in the frame too.
        const byScheme = [...FRAME.keys()].filter(
            (name) =>
                /^(#|rgb)/.test(FRAME.get(name) ?? '') ||
                (PAGE.get(name) ?? PALETTE_KIT.get(name) ?? '').includes('light-dark(')
        );
        expect(byScheme.sort()).toEqual([...BY_SCHEME.keys()].sort());
    });

    it("draws the store's own colors the same on its pages and in the widget", () => {
        const own = [...PAGE].filter(([, value]) => value.startsWith('light-dark('));
        expect(own.length).toBeGreaterThan(0);
        for (const [name, value] of own) expect(BY_SCHEME.get(name), name).toBe(value);
    });

    it("gives the widget's frame every name the widget reads, so a host's never reach it", () => {
        const read = [
            ...reads(sheet('search/searchbox.css')),
            ...reads(sheet('widget/widget.css')),
        ];
        expect(read.filter((name) => !FRAME.has(name))).toEqual([]);
    });

    it("holds every value the frame repeats from the kit to the kit's own", () => {
        // The fallback of a value set by scheme is held to that value above, not to the kit's.
        const repeated = [
            ...BY_SCHEME,
            ...[...FRAME].filter(([name]) => !BY_SCHEME.has(name)),
        ].filter(
            ([name, value]) => !PAGE.has(name) && PALETTE_KIT.has(name) && !/^(#|rgb)/.test(value)
        );
        expect(repeated.length).toBeGreaterThan(0);
        for (const [name, value] of repeated) expect(value, name).toBe(PALETTE_KIT.get(name));
    });

    for (const [theme, side] of [
        ['light', 0],
        ['dark', 1],
    ] as const) {
        it(`holds every pairing the kit measures to its ratio in the ${theme} theme`, () => {
            const short = PAIRS.flatMap(([front, back, ratio]) => {
                const [a, b] = [pair(valueOf(front)), pair(valueOf(back))];
                if (!a || !b) return [`${front} on ${back}: not a light-dark() of two colors`];
                const measured = contrast(a[side], b[side]);
                return measured < ratio
                    ? [`${front} on ${back}: ${measured.toFixed(2)}, needs ${String(ratio)}`]
                    : [];
            });
            expect(short).toEqual([]);
        });
    }

    it('name every type size, weight and line height', () => {
        expect([
            ...loose(
                'font-size',
                /^(var\(--dk-text-[a-z]+\)|max\(var\(--dk-text-body\), 16px\)|inherit)$/,
                /^[\d.]+em$/
            ),
            ...loose('font-weight', /^var\(--(dk-weight-[a-z]+|weight-mark)\)$/),
            ...loose('line-height', /^var\(--dk-(leading-[a-z]+|space-\d)\)$/),
            // The widget's frame pins its text, at a size no host's root can scale.
            ...loose('font', /^(inherit|16px\/var\(--dk-leading-[a-z]+\) system-ui, .*)$/),
        ]).toEqual([]);
    });

    it('name every corner and every shadow', () => {
        expect([
            ...loose('border-radius', /^((var\(--dk-radius(-[a-z]+)?\)|0)( |$))+$/, /^[\d.]+em$/),
            ...loose('box-shadow', /^(var\(--dk-shadow-raised\)|none)$/),
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
    ({ value }: { value: string }) => value === 'max(var(--dk-text-body), 16px)',
    ({ at, property, value }: { at: string; property: string; value: string }) =>
        at === 'widget/widget.css' && property === 'font' && value.startsWith('16px/'),
    ({ property, value }: { property: string; value: string }) =>
        ['width', 'height', 'margin'].includes(property) && /^-?1px$/.test(value),
    // The column's inset, which is never less than nothing.
    ({ value }: { value: string }) => value.startsWith('calc(max(0px,'),
];

/** The breakpoints the tokens name, as a media query writes them. */
const BREAKPOINTS = ['(max-width: 48rem)', '(max-width: 48rem) and (min-height: 34rem)'];

describe('the focus ring', () => {
    it("reads the kit's focus role, falling back to the accent as the kit's own rings do", () => {
        const rings = everyDeclaration().filter(({ property }) => property === 'outline');
        expect(rings.length).toBeGreaterThan(0);
        expect(
            rings
                .filter(({ value }) => value.includes('--dk-accent'))
                .filter(({ value }) => !value.includes('var(--dk-focus, var(--dk-accent))'))
                .map(({ at, value }) => `${at}: outline: ${value}`)
        ).toEqual([]);
    });
});

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
            // Each part of the query, as the list says it: "up to 48rem", "at least 34rem tall".
            const said = breakpoint
                .split(' and ')
                .map((part) =>
                    part
                        .replace(/^\(max-width: (.*)\)$/, 'up to $1')
                        .replace(/^\(min-height: (.*)\)$/, 'at least $1 tall')
                )
                .join(' and ');
            expect(named.replace(/\s+\*\s+/g, ' '), breakpoint).toContain(said);
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
            .filter(({ value }) =>
                /\d*\.?\d+(rem|em)\b/.test(value.replace(/var\(--[a-z-]+\d?\)/g, ''))
            )
            .map(({ at, property, value }) => `${at}: ${property}: ${value}`);
        expect(stray).toEqual([]);
    });
});
