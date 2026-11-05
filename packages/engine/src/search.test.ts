import { describe, expect, it } from 'vitest';

import { createEngine } from './search.js';
import { type Document, type EngineConfig, EngineError } from './types.js';

/*
 * A small catalog, written by hand so each test can name exactly what it
 * expects. The product shapes are what a real store has, since that is what
 * the engine is for, but nothing here depends on the catalog package.
 */
const product = (
    id: string,
    name: string,
    description: string,
    attributes: Document['attributes']
): Document => ({
    id,
    text: { name, description, brand: String(attributes['brand'] ?? '') },
    attributes,
});

const documents: Document[] = [
    product('p1', 'Northwind Trail Runner', 'A running shoe for rough ground.', {
        brand: 'Northwind',
        category: ['shoes', 'running'],
        color: ['Black', 'Olive'],
        price: 12900,
        rating: 4.6,
        position: 2,
        inStock: true,
    }),
    product('p2', 'Ostara Court Sneaker', 'A leather sneaker for every day.', {
        brand: 'Ostara',
        category: ['shoes', 'sneakers'],
        color: ['White'],
        price: 9900,
        rating: 4.1,
        position: 1,
        inStock: true,
    }),
    product('p3', 'Ostara Café Racer Jacket', 'A waxed canvas jacket with a slim fit.', {
        brand: 'Ostara',
        category: ['clothing', 'outerwear'],
        color: ['Black', 'Rust'],
        price: 24900,
        rating: 4.8,
        position: 1,
        inStock: false,
    }),
    product('p4', 'Finch & Co Everyday T-Shirt', 'A cotton tee with a relaxed fit.', {
        brand: 'Finch & Co',
        category: ['clothing', 'tops'],
        color: ['White', 'Heather Gray'],
        price: 2900,
        rating: 3.9,
        position: 3,
        inStock: true,
    }),
    product('p5', 'Finch & Co Harbor Sweater', 'A merino crewneck. Pairs with any trail runner.', {
        brand: 'Finch & Co',
        category: ['clothing', 'sweaters'],
        color: ['Navy'],
        price: 9900,
        rating: 4.1,
        position: 1,
        inStock: true,
    }),
    product('p6', 'Ridgeback Baseball Cap', 'A cotton cap with a curved brim.', {
        brand: 'Ridgeback',
        category: ['accessories', 'hats'],
        color: ['Navy', 'Black'],
        price: 2500,
        position: 1,
        inStock: true,
    }),
];

const config: EngineConfig = {
    fields: { name: { weight: 3 }, brand: { weight: 2 }, description: { weight: 1 } },
    attributes: {
        brand: 'keyword',
        category: 'keyword',
        color: 'keyword',
        price: 'number',
        rating: 'number',
        position: 'number',
        inStock: 'boolean',
    },
    synonyms: [
        { kind: 'one-way', from: 'trainers', to: 'sneakers' },
        { kind: 'equivalent', terms: ['jumper', 'sweater'] },
        { kind: 'one-way', from: 'cap', to: 'baseball cap' },
    ],
    sortScopes: { position: 'category' },
};

const engine = createEngine(documents, config);
const ids = (query: Parameters<typeof engine.search>[0]) =>
    engine.search(query).hits.map((hit) => hit.id);

describe('matching', () => {
    it('finds a product by a word in its name', () => {
        expect(ids({ query: 'jacket' })).toEqual(['p3']);
    });

    it('requires every word of a multi-word query', () => {
        expect(ids({ query: 'ostara sneaker' })).toEqual(['p2']);
        expect(ids({ query: 'ostara boots' })).toEqual([]);
    });

    it('ranks a match in the name above the same match in a description', () => {
        expect(ids({ query: 'trail runner' })).toEqual(['p1', 'p5']);
    });

    it('explains each match', () => {
        const [hit] = engine.search({ query: 'trail runner' }).hits;
        expect(hit?.matches.map((m) => [m.queryTerm, m.field, m.kind])).toEqual(
            expect.arrayContaining([
                ['trail', 'name', 'exact'],
                ['runner', 'name', 'exact'],
            ])
        );
        expect(hit?.score).toBeGreaterThan(0);
    });

    it('matches all documents for an empty query, in id order', () => {
        const result = engine.search({});
        expect(result.mode).toBe('all');
        expect(result.hits.map((h) => h.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    });
});

describe('ranking', () => {
    const ranked = (docs: Document[], query: string) =>
        createEngine(docs, config).search({ query }).hits;

    it('weighs a field by its weight, a name above a description of the same length', () => {
        const hits = ranked(
            [
                product('in-description', 'Plain Bag', 'Canvas tote', {}),
                product('in-name', 'Canvas Tote', 'Plain bag', {}),
            ],
            'canvas'
        );
        expect(hits.map((h) => h.id)).toEqual(['in-name', 'in-description']);
    });

    it('ranks a word in a short field above the same word in a long one', () => {
        const hits = ranked(
            [
                product('long', 'Classic Linen Camp Shirt', '', {}),
                product('short', 'Classic Tee', '', {}),
            ],
            'classic'
        );
        expect(hits.map((h) => h.id)).toEqual(['short', 'long']);
    });

    it('measures a field in words, so a hyphenated word does not make it longer', () => {
        // "T-Shirt" is indexed as three terms, and it is still one word of two.
        const [first, second] = ranked(
            [
                product('hyphenated', 'Classic T-Shirt', '', {}),
                product('plain', 'Classic Tee', '', {}),
            ],
            'classic'
        );
        expect(first?.score).toBeGreaterThan(0);
        expect(first?.score).toBeCloseTo(second?.score ?? 0, 10);
    });

    it('counts a rare word for more than a common one', () => {
        const [hit] = ranked(
            [
                product('tote', 'Red Linen Tote', '', {}),
                product('scarf', 'Red Wool Scarf', '', {}),
                product('shirt', 'Red Cotton Shirt', '', {}),
            ],
            'red linen'
        );
        const scoreOf = (word: string) =>
            hit?.matches.find((match) => match.queryTerm === word)?.score ?? 0;
        expect(hit?.id).toBe('tote');
        expect(scoreOf('red')).toBeGreaterThan(0);
        expect(scoreOf('linen')).toBeGreaterThan(scoreOf('red'));
    });
});

describe('normalization', () => {
    it('finds an accented name from an unaccented query, and the reverse', () => {
        expect(ids({ query: 'cafe racer' })).toEqual(['p3']);
        expect(ids({ query: 'CAFÉ' })).toEqual(['p3']);
    });

    it('finds a hyphenated name however the shopper writes it', () => {
        for (const query of ['t-shirt', 'tshirt', 't shirt', 'T-Shirts']) {
            expect(ids({ query }), query).toEqual(['p4']);
        }
    });

    it('matches plurals both ways', () => {
        expect(ids({ query: 'sneakers' })).toEqual(['p2']);
        expect(ids({ query: 'jackets' })).toEqual(['p3']);
    });
});

describe('search as you type', () => {
    it('matches the last word as a prefix only when asked', () => {
        expect(ids({ query: 'sneak', prefixLastTerm: true })).toEqual(['p2']);
        expect(ids({ query: 'sneak' })).toEqual([]);
    });

    it('treats only the last word as a prefix', () => {
        expect(ids({ query: 'ost sneak', prefixLastTerm: true })).toEqual([]);
        expect(ids({ query: 'ostara sneak', prefixLastTerm: true })).toEqual(['p2']);
    });

    it('ranks a word typed in full above a longer word it begins', () => {
        const typing = createEngine(
            [product('as-prefix', 'Runner', '', {}), product('exact', 'Run', '', {})],
            config
        );
        expect(typing.search({ query: 'run', prefixLastTerm: true }).hits.map((h) => h.id)).toEqual(
            ['exact', 'as-prefix']
        );
    });

    it('marks a prefix match as one', () => {
        const [hit] = engine.search({ query: 'sneak', prefixLastTerm: true }).hits;
        expect(hit?.matches.some((m) => m.kind === 'prefix')).toBe(true);
    });
});

describe('explaining a hit', () => {
    const sum = (hit: { matches: readonly { score: number }[] }) =>
        hit.matches.reduce((total, match) => total + match.score, 0);

    it('gives matches that add up to the score, word by word in the order typed', () => {
        // "cap" reads both as typed and as the synonym "baseball cap", so the
        // cap's matches must come from the reading it was scored by.
        for (const query of ['trail runner', 'finch cotton', 'ostara sneak', 'jumper', 'cap']) {
            const { hits } = engine.search({ query, prefixLastTerm: true });
            expect(hits.length, query).toBeGreaterThan(0);
            for (const hit of hits)
                expect(sum(hit), `${query} ${hit.id}`).toBeCloseTo(hit.score, 10);
        }
        const [hit] = engine.search({ query: 'runner trail' }).hits;
        expect(hit?.matches.map((match) => match.queryTerm)).toEqual(['runner', 'trail']);
    });

    it('finds the same documents with the same scores whatever order the words come in', () => {
        const forward = engine.search({ query: 'finch cotton tee' });
        const backward = engine.search({ query: 'tee cotton finch' });
        expect(backward.hits.map((hit) => [hit.id, hit.score])).toEqual(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Vitest types its asymmetric matchers as any
            forward.hits.map((hit) => [hit.id, expect.closeTo(hit.score, 10)])
        );
        expect(forward.hits.length).toBeGreaterThan(0);
    });

    it('explains a typo beside a word typed right, each by what matched it', () => {
        const result = engine.search({ query: 'ostara sneakr' });
        expect(result.mode).toBe('fuzzy');
        const [hit] = result.hits;
        expect(hit?.id).toBe('p2');
        expect(hit?.matches.map((match) => [match.queryTerm, match.kind])).toEqual(
            expect.arrayContaining([
                ['ostara', 'exact'],
                ['sneakr', 'fuzzy'],
            ])
        );
        expect(sum(hit ?? { matches: [] })).toBeCloseTo(hit?.score ?? 0, 10);
    });

    it('keeps the matches of a pinned document the query matched, and gives none to one it did not', () => {
        // The sneaker has "ostara" but not "jacket", so it is there only by its pin.
        const pinned = engine.reconfigure({
            rules: [{ id: 'pin', when: { queries: ['ostara jacket'] }, pin: ['p2', 'p3'] }],
        });
        const [sneaker, jacket] = pinned.search({ query: 'ostara jacket' }).hits;
        expect(sneaker).toMatchObject({ id: 'p2', matches: [] });
        expect(jacket?.id).toBe('p3');
        expect(jacket?.matches.map((match) => match.queryTerm)).toEqual(
            expect.arrayContaining(['ostara', 'jacket'])
        );
        expect(sum(jacket ?? { matches: [] })).toBeCloseTo(jacket?.score ?? 0, 10);
    });
});

describe('typo tolerance', () => {
    it('corrects one typo per word when nothing matches exactly', () => {
        const result = engine.search({ query: 'sneakr' });
        expect(result.mode).toBe('fuzzy');
        expect(result.hits.map((h) => h.id)).toEqual(['p2']);
        expect(result.hits[0]?.matches[0]?.kind).toBe('fuzzy');
    });

    it('corrects a swapped pair of letters', () => {
        expect(ids({ query: 'jakcet' })).toEqual(['p3']);
    });

    it('does not run the fuzzy pass when the exact pass found something', () => {
        // "cap" exactly matches the cap. Fuzzily it is one edit from "cat",
        // "can" and others, none of which should dilute an exact result.
        const result = engine.search({ query: 'cap' });
        expect(result.mode).toBe('exact');
        expect(result.hits.map((h) => h.id)).toEqual(['p6']);
    });

    it('gives up on two typos, and on very short words', () => {
        expect(engine.search({ query: 'snaekre' }).mode).toBe('none');
        // "ca" is one letter short of the shortest word that is corrected, and one letter from
        // "cap", so only its length keeps it from being corrected.
        expect(engine.search({ query: 'ca' }).mode).toBe('none');
    });

    it('ranks a word typed right above a correction of the same word', () => {
        // "blak" matches nothing as typed, so both products are found by the typo pass.
        const typos = createEngine(
            [
                product('corrected', 'Black Boat', '', {}),
                product('typed-right', 'Black Boot', '', {}),
            ],
            config
        );
        const result = typos.search({ query: 'boot blak' });
        expect(result.mode).toBe('fuzzy');
        expect(result.hits.map((h) => h.id)).toEqual(['typed-right', 'corrected']);
    });

    it('scores each word as itself when the typo pass reads the words in another order', () => {
        // As typed, "boot" is the narrower word. Read with its typos, "boot" or "boat" is
        // wider than "red", so the typo pass starts from "red".
        const typos = createEngine(
            [
                product('p1', 'Boot', '', {}),
                product('p2', 'Red Boat', '', {}),
                product('p3', 'Red Boat Classic', '', {}),
            ],
            config
        );
        const result = typos.search({ query: 'boot red' });
        expect(result.mode).toBe('fuzzy');
        expect(result.hits.map((h) => h.id)).toEqual(['p2', 'p3']);
    });
});

describe('synonyms', () => {
    it('widens a one-way synonym in its one direction', () => {
        expect(ids({ query: 'trainers' })).toEqual(['p2']);
        expect(engine.search({ query: 'trainers' }).hits[0]?.matches[0]?.kind).toBe('synonym');
    });

    it('treats equivalent terms as each other', () => {
        expect(ids({ query: 'jumper' })).toEqual(['p5']);
        expect(ids({ query: 'sweater' })).toEqual(['p5']);
    });

    it('expands to a multi-word synonym only where every word is present', () => {
        // Each of the other two holds one word of "baseball cap".
        const hats = createEngine(
            [
                product('cap', 'Ridgeback Baseball Cap', '', {}),
                product('glove', 'Leather Baseball Glove', '', {}),
                product('wool', 'Wool Cap', '', {}),
            ],
            { ...config, synonyms: [{ kind: 'one-way', from: 'hat', to: 'baseball cap' }] }
        );
        expect(hats.search({ query: 'hat' }).hits.map((h) => h.id)).toEqual(['cap']);
    });
});

describe('filters', () => {
    it('filters by a single value and by any of several', () => {
        expect(ids({ filters: [{ attribute: 'brand', eq: 'Ostara' }] })).toEqual(['p2', 'p3']);
        expect(ids({ filters: [{ attribute: 'color', in: ['Rust', 'Navy'] }] })).toEqual([
            'p3',
            'p5',
            'p6',
        ]);
    });

    it('matches a multi-valued attribute when any value matches', () => {
        expect(ids({ filters: [{ attribute: 'category', eq: 'shoes' }] }).sort()).toEqual([
            'p1',
            'p2',
        ]);
    });

    it('filters a boolean', () => {
        expect(ids({ filters: [{ attribute: 'inStock', eq: false }] })).toEqual(['p3']);
    });

    it('treats the upper bound of a range as exclusive', () => {
        expect(ids({ filters: [{ attribute: 'price', range: { from: 2500, to: 9900 } }] })).toEqual(
            ['p4', 'p6']
        );
        expect(ids({ filters: [{ attribute: 'price', range: { from: 9900 } }] })).toEqual([
            'p1',
            'p2',
            'p3',
            'p5',
        ]);
    });

    it('combines filters with a query', () => {
        expect(ids({ query: 'ostara', filters: [{ attribute: 'inStock', eq: true }] })).toEqual([
            'p2',
        ]);
    });

    it('refuses an attribute nobody declared, as the caller mistake it is', () => {
        expect(() => engine.search({ filters: [{ attribute: 'colour', eq: 'Black' }] })).toThrow(
            EngineError
        );
        try {
            engine.search({ filters: [{ attribute: 'colour', eq: 'Black' }] });
        } catch (error) {
            expect(error).toMatchObject({ code: 'unknown_attribute' });
        }
    });

    it('reports no match when the filters remove every match of the query', () => {
        // The jacket is the only match for "jacket", and it is out of stock.
        const result = engine.search({
            query: 'jacket',
            filters: [{ attribute: 'inStock', eq: true }],
        });
        expect(result).toMatchObject({ mode: 'none', total: 0, hits: [] });
    });

    it('refuses true or false for an attribute that is not a boolean', () => {
        for (const filter of [
            { attribute: 'brand', eq: true },
            { attribute: 'price', eq: false },
        ]) {
            expect(() => engine.search({ filters: [filter] }), filter.attribute).toThrow(
                expect.objectContaining({
                    code: 'wrong_attribute_kind',
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest types its asymmetric matchers as any
                    message: expect.stringMatching(/only a boolean attribute/),
                })
            );
        }
    });

    it('refuses a range on anything but a number', () => {
        expect(() =>
            engine.search({ filters: [{ attribute: 'brand', range: { from: 1 } }] })
        ).toThrow(/only a number attribute/);
    });

    it('refuses a word for a number or a boolean, rather than matching nothing', () => {
        for (const filter of [
            { attribute: 'price', eq: '9900' },
            { attribute: 'price', in: ['9900'] },
            { attribute: 'inStock', eq: 'true' },
            { attribute: 'inStock', in: ['true'] },
        ]) {
            expect(() => engine.search({ filters: [filter] }), filter.attribute).toThrow(
                expect.objectContaining({
                    code: 'wrong_attribute_kind',
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest types its asymmetric matchers as any
                    message: expect.stringMatching(/only a keyword attribute/),
                })
            );
        }
    });
});

describe('sorting', () => {
    it('sorts by a number either way', () => {
        expect(ids({ sort: [{ by: 'price', direction: 'asc' }] })).toEqual([
            'p6',
            'p4',
            'p2',
            'p5',
            'p1',
            'p3',
        ]);
        expect(ids({ sort: [{ by: 'price', direction: 'desc' }] })[0]).toBe('p3');
    });

    it('breaks ties on the next clause, and then on the id', () => {
        expect(
            ids({
                sort: [
                    { by: 'price', direction: 'asc' },
                    { by: 'rating', direction: 'desc' },
                ],
            }).slice(2, 4)
        ).toEqual(['p2', 'p5']);
    });

    it('sorts a multi-valued attribute by its first value', () => {
        // By their last colors the order would start with the cap and the T-shirt.
        expect(ids({ sort: [{ by: 'color', direction: 'asc' }] })).toEqual([
            'p1',
            'p3',
            'p5',
            'p6',
            'p2',
            'p4',
        ]);
    });

    it('puts documents missing the attribute last, whichever direction', () => {
        expect(ids({ sort: [{ by: 'rating', direction: 'desc' }] }).at(-1)).toBe('p6');
        expect(ids({ sort: [{ by: 'rating', direction: 'asc' }] }).at(-1)).toBe('p6');
    });

    it('honors a scoped sort inside its filter', () => {
        const result = engine.search({
            filters: [{ attribute: 'category', eq: 'clothing' }],
            sort: [{ by: 'position', direction: 'asc' }],
        });
        expect(result.hits.map((h) => h.id)).toEqual(['p3', 'p5', 'p4']);
        expect(result.sort).toEqual([{ by: 'position', direction: 'asc' }]);
    });

    it('sorts by the scoped sort when browsing its scope without asking', () => {
        const browsing = engine.search({ filters: [{ attribute: 'category', eq: 'clothing' }] });
        expect(browsing.sort).toEqual([{ by: 'position', direction: 'asc' }]);
        expect(browsing.hits.map((h) => h.id)).toEqual(['p3', 'p5', 'p4']);
        // A query, or a filter that is not one value of the scope, keeps the usual default.
        expect(
            engine.search({ query: 'shirt', filters: [{ attribute: 'category', eq: 'clothing' }] })
                .sort
        ).toEqual([{ by: 'relevance', direction: 'desc' }]);
        expect(
            engine.search({ filters: [{ attribute: 'category', in: ['clothing'] }] }).sort
        ).toEqual([{ by: 'id', direction: 'asc' }]);
    });

    it('falls back to relevance for a scoped sort outside its filter, and says so', () => {
        const result = engine.search({
            query: 'ostara',
            sort: [{ by: 'position', direction: 'asc' }],
        });
        expect(result.sort).toEqual([{ by: 'relevance', direction: 'desc' }]);
        expect(result.hits.map((h) => h.id)).toEqual(['p2', 'p3']);
    });

    it("sorts by the index's own order when asked, either way", () => {
        const ascending = engine.search({ sort: [{ by: 'id', direction: 'asc' }] });
        expect(ascending.sort).toEqual([{ by: 'id', direction: 'asc' }]);
        const descending = engine.search({ sort: [{ by: 'id', direction: 'desc' }] });
        expect(descending.hits.map((h) => h.id)).toEqual(
            [...ascending.hits.map((h) => h.id)].reverse()
        );
        expect(ascending.hits.map((h) => h.id)).toEqual(engine.search({}).hits.map((h) => h.id));
    });

    it('sorts by id in the order the documents came in, not by the ids as text', () => {
        const unpadded = createEngine(
            [
                product('p10', 'Tenth', '', { brand: 'A' }),
                product('p2', 'Second', '', { brand: 'A' }),
            ],
            config
        );
        const sorted = (direction: 'asc' | 'desc') =>
            unpadded.search({ sort: [{ by: 'id', direction }] }).hits.map((h) => h.id);
        expect(sorted('asc')).toEqual(['p10', 'p2']);
        expect(sorted('desc')).toEqual(['p2', 'p10']);
    });

    it('sorts by a declared attribute named id as any other attribute', () => {
        const declared = createEngine(
            [
                product('a', 'First', '', { brand: 'A', id: 2 }),
                product('b', 'Second', '', { brand: 'A', id: 1 }),
            ],
            { ...config, attributes: { ...config.attributes, id: 'number' } }
        );
        expect(
            declared.search({ sort: [{ by: 'id', direction: 'asc' }] }).hits.map((h) => h.id)
        ).toEqual(['b', 'a']);
    });

    it('refuses to sort by an unknown attribute', () => {
        expect(() => engine.search({ sort: [{ by: 'popularity', direction: 'desc' }] })).toThrow(
            EngineError
        );
    });
});

describe('pagination', () => {
    it('pages by the size asked for and reports the shape', () => {
        const result = engine.search({ pageSize: 4 });
        expect(result).toMatchObject({ total: 6, page: 1, pageSize: 4, totalPages: 2 });
        expect(result.hits).toHaveLength(4);
        expect(engine.search({ pageSize: 4, page: 2 }).hits.map((h) => h.id)).toEqual(['p5', 'p6']);
    });

    it('returns an empty page past the end rather than failing', () => {
        const result = engine.search({ pageSize: 4, page: 3 });
        expect(result.hits).toEqual([]);
        expect(result).toMatchObject({ page: 3, totalPages: 2, total: 6 });
    });

    it('clamps the page size and the page number', () => {
        const small = createEngine(documents, { ...config, limits: { pageSize: 2 } });
        expect(small.search({ pageSize: 50 }).pageSize).toBe(2);
        expect(engine.search({ page: 0 }).page).toBe(1);
        expect(engine.search({ pageSize: 0 }).pageSize).toBe(1);
    });

    it('caps how far a query can be paged while still reporting the full total', () => {
        // Three of six in reach, two to a page, is two pages, where all six would be three.
        const capped = createEngine(documents, { ...config, limits: { results: 3 } });
        const result = capped.search({ pageSize: 2, page: 2 });
        expect(result.total).toBe(6);
        expect(result.totalPages).toBe(2);
        expect(result.hits.map((h) => h.id)).toEqual(['p3']);
        expect(capped.search({ pageSize: 2, page: 3 }).hits).toEqual([]);
    });

    /*
     * Equal scores are the trap. Fifty documents that all match "widget"
     * equally well have no natural order, and an engine that leaves it to
     * chance shows some twice across pages and others never.
     */
    it('pages through equal scores without a duplicate or a gap', () => {
        const alike = Array.from({ length: 50 }, (_, i) =>
            product(`w${String(50 - i).padStart(2, '0')}`, 'Widget', 'A widget.', { price: 100 })
        );
        const same = createEngine(alike, config);
        const seen: string[] = [];
        for (let page = 1; page <= 7; page += 1) {
            seen.push(...same.search({ query: 'widget', pageSize: 8, page }).hits.map((h) => h.id));
        }
        expect(seen).toHaveLength(50);
        expect(new Set(seen).size).toBe(50);
        expect(seen).toEqual([...seen].sort());
    });
});

describe('pagination under the default limits', () => {
    // One more than the default cap on results, so the cap is the one thing that stops a page.
    const many = createEngine(
        Array.from({ length: 10_001 }, (_, i) =>
            product(`d${String(i).padStart(5, '0')}`, 'Widget', '', {})
        ),
        config
    );

    it('pages twenty at a time when no size is asked for', () => {
        const result = many.search({});
        expect(result.pageSize).toBe(20);
        expect(result.hits).toHaveLength(20);
    });

    it('gives a page at most a hundred, however many are asked for', () => {
        const result = many.search({ pageSize: 500 });
        expect(result.pageSize).toBe(100);
        expect(result.hits).toHaveLength(100);
    });

    it('pages no further than ten thousand results, while reporting the full total', () => {
        const last = many.search({ pageSize: 100, page: 100 });
        expect(last).toMatchObject({ total: 10_001, totalPages: 100 });
        expect(last.hits.at(-1)?.id).toBe('d09999');
        expect(many.search({ pageSize: 100, page: 101 }).hits).toEqual([]);
    });
});

describe('configuration', () => {
    it('refuses a document whose attribute is the wrong kind', () => {
        expect(() => createEngine([product('x', 'X', '', { price: 'cheap' })], config)).toThrow(
            /declared number/
        );
    });

    it('refuses a keyword list of anything but words, and a boolean that is neither', () => {
        // A document read from JSON can carry what its type says it cannot.
        const listed = { id: 'x', text: {}, attributes: { color: ['Red', 5] } };
        // @ts-expect-error -- a number in a keyword list, which the type rules out
        expect(() => createEngine([listed], config)).toThrow(/color is declared keyword/);
        expect(() => createEngine([product('x', 'X', '', { inStock: 'yes' })], config)).toThrow(
            /inStock is declared boolean/
        );
    });

    it('reports its size', () => {
        expect(engine.size).toBe(6);
    });
});

describe('a page from the top of the matches', () => {
    it('is the page a full sort gives, even when a score is not a number', () => {
        // A boost of Infinity on a browse, where every score is zero, makes NaN.
        const boosted = createEngine(documents, {
            ...config,
            rules: [
                {
                    id: 'endless',
                    boost: [{ attribute: { name: 'brand', value: 'Northwind' }, weight: Infinity }],
                },
            ],
        });
        const sort = [{ by: 'relevance', direction: 'desc' }] as const;
        const all = boosted.search({ sort, pageSize: 100 }).hits.map((hit) => hit.id);
        const paged = all.map(
            (_, i) => boosted.search({ sort, pageSize: 1, page: i + 1 }).hits[0]?.id
        );
        expect(paged).toEqual(all);
        // The one document without a score, the Northwind shoe, sorts last.
        expect(all.at(-1)).toBe('p1');
    });
});
