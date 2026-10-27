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
    text: { name, description, brand: String(attributes.brand ?? '') },
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

    it('marks a prefix match as one', () => {
        const [hit] = engine.search({ query: 'sneak', prefixLastTerm: true }).hits;
        expect(hit?.matches.some((m) => m.kind === 'prefix')).toBe(true);
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
        expect(engine.search({ query: 'xz' }).mode).toBe('none');
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
        expect(ids({ query: 'cap' })).toEqual(['p6']);
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

    it('refuses a range on anything but a number', () => {
        expect(() =>
            engine.search({ filters: [{ attribute: 'brand', range: { from: 1 } }] })
        ).toThrow(/only a number attribute/);
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

    it('refuses to sort by an unknown attribute', () => {
        expect(() => engine.search({ sort: [{ by: 'popularity', direction: 'desc' }] })).toThrow(
            EngineError
        );
    });
});

describe('pagination', () => {
    it('pages with a default size and reports the shape', () => {
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
        const capped = createEngine(documents, { ...config, limits: { results: 5 } });
        const result = capped.search({ pageSize: 2, page: 3 });
        expect(result.total).toBe(6);
        expect(result.totalPages).toBe(3);
        expect(result.hits.map((h) => h.id)).toEqual(['p5']);
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

describe('configuration', () => {
    it('refuses a document whose attribute is the wrong kind', () => {
        expect(() => createEngine([product('x', 'X', '', { price: 'cheap' })], config)).toThrow(
            /declared number/
        );
    });

    it('reports its size', () => {
        expect(engine.size).toBe(6);
    });
});
