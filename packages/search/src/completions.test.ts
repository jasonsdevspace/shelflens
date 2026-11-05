import { type Catalog, generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { createCompletions } from './completions.js';

const generated = generateCatalog({ seed: 42, products: 1 });

/** A catalog of products with these names and brands, in no category. */
const catalogOf = (products: readonly (readonly [name: string, brand: string])[]): Catalog => {
    const base = generated.products[0];
    if (!base) throw new Error('the catalog should have a product');
    return {
        ...generated,
        products: products.map(([name, brand], i) => ({
            ...base,
            sku: `p${i}`,
            name,
            brand,
            categoryPath: [],
        })),
    };
};

// Harbor Hat starts with its brand, as a generated name does, so it holds harbor twice.
const completions = createCompletions(
    catalogOf([
        ['Harbor Hat', 'Harbor'],
        ['Harvest Hat', 'Acme'],
        ['Harvest Cap', 'Acme'],
        ['Sneaker', 'Acme'],
        ['Sneakers Low', 'Acme'],
        ['Sneakers High', 'Acme'],
        ['Trail Boot', 'Acme'],
        ['Trailhead Boot', 'Acme'],
    ])
);

describe('completions', () => {
    it('leaves out the word exactly as typed', () => {
        expect(completions.complete('trail', 5)).toEqual(['trailhead']);
    });

    it('puts the word more products use first', () => {
        expect(completions.complete('sne', 5)).toEqual(['sneakers', 'sneaker']);
    });

    it('stops at the limit', () => {
        expect(completions.complete('sne', 1)).toEqual(['sneakers']);
    });

    it('counts a word once for each product that uses it', () => {
        expect(completions.complete('har', 5)).toEqual(['harvest', 'harbor']);
    });

    it('keeps the words typed before the last one', () => {
        expect(completions.complete('wool sne', 1)).toEqual(['wool sneakers']);
    });
});
