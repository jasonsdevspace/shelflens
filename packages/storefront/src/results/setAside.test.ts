import { generateCatalog } from '@shelflens/catalog';
import { createStoreEngine, searchStore } from '@shelflens/search';
import { describe, expect, it } from 'vitest';

import { onlyUnderRelevance, setAsideBySort } from './setAside.js';

describe('what the page says about rules a sort set aside', () => {
    it('says nothing when the sort set none aside', () => {
        expect(setAsideBySort('price-asc', [])).toBeUndefined();
    });

    it('names each rule and what the sort took from it', () => {
        expect(
            setAsideBySort('price-asc', [
                {
                    ruleId: 'featured-jackets',
                    name: 'Featured jackets',
                    pins: 2,
                    boosts: 0,
                    buries: 0,
                },
            ])
        ).toBe('The sort “Price, low to high” sets aside the pins of “Featured jackets”.');
        expect(
            setAsideBySort('position', [
                {
                    ruleId: 'ridgeback-boots',
                    name: 'Ridgeback boots first',
                    pins: 0,
                    boosts: 1,
                    buries: 0,
                },
            ])
        ).toBe('The sort “Featured” sets aside the boost of “Ridgeback boots first”.');
    });

    it('lists every kind a rule lost, and every rule, as a list is read', () => {
        expect(
            setAsideBySort('rating', [
                { ruleId: 'a', name: 'All three', pins: 1, boosts: 2, buries: 1 },
                { ruleId: 'b', name: 'Buries', pins: 0, boosts: 0, buries: 3 },
                { ruleId: 'c', name: 'Pins', pins: 1, boosts: 0, buries: 0 },
            ])
        ).toBe(
            'The sort “Rating” sets aside the pin, boosts and bury of “All three”, the buries of “Buries” and the pin of “Pins”.'
        );
    });

    it('names a rule with no name by its id', () => {
        expect(
            setAsideBySort('newest', [
                { ruleId: 'promo', name: null, pins: 1, boosts: 0, buries: 0 },
            ])
        ).toBe('The sort “Newest” sets aside the pin of “promo”.');
    });
});

describe('what the rule form says of a boost or a bury', () => {
    it('is what the store does: every sort but relevance sets a boost aside, the category’s own included', () => {
        const store = createStoreEngine(generateCatalog({ seed: 42, products: 50 })).reconfigure({
            rules: [
                {
                    id: 'for-the-category',
                    when: { filter: { attribute: 'category', value: 'boots' } },
                    boost: [{ attribute: { name: 'brand', value: 'Ridgeback' }, weight: 1.5 }],
                },
                {
                    id: 'for-the-words',
                    when: { queries: ['boot'] },
                    bury: [{ attribute: { name: 'brand', value: 'Ridgeback' }, weight: 0.5 }],
                },
            ],
        });
        for (const by of ['position', 'rating'] as const) {
            const result = searchStore(store, {
                group: 'guest',
                query: 'boot',
                filters: [{ attribute: 'category', eq: 'boots' }],
                sort: [{ by, direction: 'desc' }],
            });
            expect(result.sort[0]?.by, by).toBe(by);
            expect(result.rules.setAsideBySort, by).toEqual(['for-the-category', 'for-the-words']);
        }
    });

    it('says so in the sorts’ own names', () => {
        expect(onlyUnderRelevance('boost')).toBe(
            'A boost applies only under “Relevance”, where a search starts. Every other sort sets it aside, “Featured” included.'
        );
        expect(onlyUnderRelevance('bury')).toContain('A bury applies only under “Relevance”');
    });
});
