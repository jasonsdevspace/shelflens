import { generateCatalog } from '@shelflens/catalog';
import { createStoreEngine, searchStore } from '@shelflens/search';
import { describe, expect, it } from 'vitest';

import { SCOPED_FILTER, setAsideByOwnSort, setAsideBySort } from './setAside.js';

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

describe('what the rule form says of a boost under the category’s own sort', () => {
    it('names the filter the store scopes that sort to, as the store itself reports it', () => {
        const store = createStoreEngine(generateCatalog({ seed: 42, products: 50 })).reconfigure({
            rules: [
                {
                    id: 'boots-boost',
                    when: { filter: { attribute: SCOPED_FILTER, value: 'boots' } },
                    boost: [{ attribute: { name: 'brand', value: 'Ridgeback' }, weight: 1.5 }],
                },
            ],
        });
        const result = searchStore(store, {
            group: 'guest',
            filters: [{ attribute: SCOPED_FILTER, eq: 'boots' }],
            sort: [{ by: 'position', direction: 'asc' }],
        });
        expect(result.sort[0]?.by).toBe('position');
        expect(result.rules.setAsideBySort).toEqual(['boots-boost']);
    });

    it('speaks only to a rule for one category', () => {
        expect(setAsideByOwnSort({ attribute: 'category' }, 'boost')).toBe(
            'Under “Featured”, the category’s own order, a boost does nothing. It applies under “Relevance”, where a search starts.'
        );
        expect(setAsideByOwnSort({ attribute: 'category' }, 'bury')).toContain(
            'a bury does nothing'
        );
        expect(setAsideByOwnSort({ attribute: 'brand' }, 'boost')).toBeUndefined();
        expect(setAsideByOwnSort(undefined, 'boost')).toBeUndefined();
    });
});
