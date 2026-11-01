import { describe, expect, it } from 'vitest';

import { summary } from './rule-form.js';

describe('a rule in a few words', () => {
    it('says a boost and a bury by their factor, as the cards do', () => {
        expect(
            summary({
                id: 'summer-promo',
                boost: [{ attribute: { name: 'brand', value: 'Ridgeback' }, weight: 1.5 }],
                bury: [{ ids: ['SL-1', 'SL-2'], weight: 0.5 }],
            })
        ).toBe('Boosts Ridgeback 1.5×. Buries 2 products 0.5×');
    });
});
