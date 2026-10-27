import { describe, expect, it } from 'vitest';

import { createEngine } from './search.js';
import { type Document, type EngineConfig, EngineError, type Facet } from './types.js';

const shoe = (
    id: string,
    brand: string,
    colors: string[],
    price: number,
    rating?: number
): Document => ({
    id,
    text: { name: `${brand} ${id} shoe` },
    attributes: { brand, color: colors, price, ...(rating !== undefined && { rating }) },
});

const documents: Document[] = [
    shoe('s1', 'Northwind', ['Red', 'Black'], 5000, 4.5),
    shoe('s2', 'Northwind', ['Blue'], 7000, 3.5),
    shoe('s3', 'Ostara', ['Red'], 9000),
    shoe('s4', 'Ostara', ['Blue', 'White'], 12000, 4.0),
    shoe('s5', 'Ridgeback', ['Black'], 15000, 5.0),
];

const config: EngineConfig = {
    fields: { name: { weight: 1 } },
    attributes: { brand: 'keyword', color: 'keyword', price: 'number', rating: 'number' },
    facets: {
        brand: { kind: 'keyword', attribute: 'brand' },
        color: { kind: 'keyword', attribute: 'color', maxBuckets: 2 },
        price: {
            kind: 'range',
            attribute: 'price',
            ranges: [{ to: 7000 }, { from: 7000, to: 12000 }, { from: 12000 }],
        },
        rating: { kind: 'stats', attribute: 'rating' },
    },
};

const engine = createEngine(documents, config);
const facet = (facets: readonly Facet[], name: string) => facets.find((f) => f.name === name);

describe('facet counts', () => {
    it('counts every value of a keyword facet, most common first', () => {
        const { facets } = engine.search({ facets: ['brand'] });
        expect(facet(facets, 'brand')).toEqual({
            name: 'brand',
            attribute: 'brand',
            kind: 'keyword',
            buckets: [
                { kind: 'value', value: 'Northwind', count: 2 },
                { kind: 'value', value: 'Ostara', count: 2 },
                { kind: 'value', value: 'Ridgeback', count: 1 },
            ],
        });
    });

    it('counts a document once for each of its values and caps the list', () => {
        const { facets } = engine.search({ facets: ['color'] });
        expect(facet(facets, 'color')).toMatchObject({
            buckets: [
                { value: 'Black', count: 2 },
                { value: 'Blue', count: 2 },
            ],
        });
    });

    it('counts documents into ranges whose upper bound is exclusive', () => {
        const { facets } = engine.search({ facets: ['price'] });
        expect(facet(facets, 'price')).toMatchObject({
            kind: 'range',
            buckets: [
                { to: 7000, count: 1 },
                { from: 7000, to: 12000, count: 2 },
                { from: 12000, count: 2 },
            ],
        });
    });

    it('reports the smallest and largest value, skipping documents without one', () => {
        const { facets } = engine.search({ facets: ['rating'] });
        expect(facet(facets, 'rating')).toEqual({
            name: 'rating',
            attribute: 'rating',
            kind: 'stats',
            count: 4,
            min: 3.5,
            max: 5,
        });
    });

    it('reports a stats facet with no values as empty', () => {
        const { facets } = engine.search({
            query: 's3',
            filters: [{ attribute: 'brand', eq: 'Ostara' }],
            facets: ['rating'],
        });
        expect(facet(facets, 'rating')).toEqual({
            name: 'rating',
            attribute: 'rating',
            kind: 'stats',
            count: 0,
        });
    });

    it('counts all configured facets by default and none when asked for none', () => {
        expect(engine.search({}).facets.map((f) => f.name)).toEqual([
            'brand',
            'color',
            'price',
            'rating',
        ]);
        expect(engine.search({ facets: [] }).facets).toEqual([]);
    });

    it('refuses a facet nobody configured', () => {
        expect(() => engine.search({ facets: ['size'] })).toThrow(EngineError);
    });
});

/*
 * The property that makes facets usable. Picking "Red" must not drop
 * "Blue" to zero in the same facet, or the shopper could never widen a
 * selection. A filter on another attribute does narrow every facet.
 */
describe('counts after a selection', () => {
    it('ignores a facet own filter when counting that facet', () => {
        const { facets, hits } = engine.search({
            filters: [{ attribute: 'color', eq: 'Red' }],
            facets: ['color'],
        });
        expect(hits.map((h) => h.id)).toEqual(['s1', 's3']);
        expect(facet(facets, 'color')).toMatchObject({
            buckets: [
                { value: 'Black', count: 2 },
                { value: 'Blue', count: 2 },
            ],
        });
    });

    it('still narrows a facet by filters on other attributes', () => {
        const { facets } = engine.search({
            filters: [
                { attribute: 'color', eq: 'Red' },
                { attribute: 'brand', eq: 'Northwind' },
            ],
            facets: ['color', 'brand'],
        });
        // The color facet is capped at two buckets, so Red falls off the end.
        expect(facet(facets, 'color')).toMatchObject({
            buckets: [
                { value: 'Black', count: 1 },
                { value: 'Blue', count: 1 },
            ],
        });
        expect(facet(facets, 'brand')).toMatchObject({
            buckets: [
                { value: 'Northwind', count: 1 },
                { value: 'Ostara', count: 1 },
            ],
        });
    });

    it('counts within the query, not the whole catalog', () => {
        const { facets } = engine.search({ query: 'northwind', facets: ['color'] });
        expect(facet(facets, 'color')).toMatchObject({
            buckets: [
                { value: 'Black', count: 1 },
                { value: 'Blue', count: 1 },
            ],
        });
    });
});
