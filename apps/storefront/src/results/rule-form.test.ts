import { describe, expect, it } from 'vitest';

import { fresh, summary } from './rule-form.js';

describe('a rule in a few words', () => {
    it('says a boost and a bury by their factor, as the cards do', () => {
        expect(
            summary(
                {
                    id: 'summer-promo',
                    boost: [{ attribute: { name: 'brand', value: 'Ridgeback' }, weight: 1.5 }],
                    bury: [{ ids: ['SL-1', 'SL-2'], weight: 0.5 }],
                },
                'en-US'
            )
        ).toBe('Boosts Ridgeback 1.5×. Buries 2 products 0.5×');
    });
});

describe('a new rule’s id', () => {
    it('folds the accents of the phrase it starts from, as the catalog’s ids do', () => {
        expect(fresh('café crème').id).toMatch(/^cafe-creme-[a-z0-9]{1,4}$/);
        expect(fresh('').id).toMatch(/^rule-/);
    });
});
