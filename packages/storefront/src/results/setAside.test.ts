import { describe, expect, it } from 'vitest';

import { setAsideBySort } from './setAside.js';

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

    it('keeps a category’s own pins under the category’s sort, and names the rest', () => {
        expect(setAsideBySort('position', ['ridgeback-boots'])).toBe(
            'The sort “Featured” keeps a category’s own pins, and sets aside the rest of what the rule ridgeback-boots does to the order.'
        );
        expect(setAsideBySort('position', ['a', 'b'])).toContain('the rules a, b do to the order.');
    });
});
