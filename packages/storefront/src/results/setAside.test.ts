import { generateCatalog } from '@shelflens/catalog';
import { createStoreEngine, searchStore } from '@shelflens/search';
import { describe, expect, it } from 'vitest';

import { onlyUnderRelevance, setAsideBySort } from './setAside.js';

describe('what the page says about rules a sort set aside', () => {
    it('says nothing when the sort set none aside', () => {
        expect(setAsideBySort('price-asc', [])).toBeUndefined();
    });

    it('names the pins, boosts and buries under a sort that is not the category’s own', () => {
        expect(setAsideBySort('price-asc', ['featured-jacket'])).toBe(
            'The sort “Price, low to high” sets aside the pins, boosts and buries of the rule featured-jacket.'
        );
        expect(setAsideBySort('rating', ['a', 'b'])).toBe(
            'The sort “Rating” sets aside the pins, boosts and buries of the rules a, b.'
        );
    });

    it('keeps only a category’s own pins under the category’s sort, and names the rest', () => {
        expect(setAsideBySort('position', ['ridgeback-boots'])).toBe(
            'The sort “Featured” keeps pins only from a category’s own rules. It sets aside every other change the rule ridgeback-boots makes to the order.'
        );
        expect(setAsideBySort('position', ['a', 'b'])).toContain(
            'the rules a, b make to the order.'
        );
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
